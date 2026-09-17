-- Odentia Core — RIPS Fase A4B: corrección controlada y auditable de
-- Servicio RIPS en atenciones YA finalizadas.
--
-- Context (see the A4B preflight investigation this session): Grupo/
-- Servicio RIPS (encounter_services.grupo_servicios_code/cod_servicio_code)
-- are snapshotted ONLY at encounter-finalize time
-- (upsert_patient_clinical_encounter, unmodified here) — confirming a
-- clinic_specialty_rips_services row later (A4,
-- confirm_clinic_specialty_rips_service) never touches an
-- already-finalized encounter's own frozen snapshot. That's deliberate
-- (a finalized historia clínica stays immutable), but it leaves genuinely
-- historical encounters — finalized BEFORE the clinic confirmed the
-- specialty — permanently blocked on RIPS_SERVICE_CONFIGURATION_MISSING
-- with no way forward. This migration is that one, narrow, explicit
-- correction path — the ONLY thing it ever does is retroactively apply
-- the clinic's OWN currently-confirmed institutional configuration to the
-- two RIPS-administrative columns that were left null, never anything a
-- client chooses freely.
--
-- Two pieces, same convention as
-- correct_finalized_encounter_rips_gaps (20260912100000, the existing
-- "narrow write path for a finalized encounter's own RIPS gaps"
-- precedent this migration deliberately mirrors rather than extends —
-- that function's resolution model is "client supplies a value, RPC only
-- fills a currently-null field"; A4B's is "RPC derives the value itself
-- from clinic_specialty_rips_services, client supplies nothing but which
-- encounter" — different enough to warrant its own function rather than
-- overloading that one's contract):
--   1. encounter_service_rips_corrections — append-only audit log, never
--      exposed for direct client write (no INSERT policy/grant at all —
--      the RPC below is the only writer, via SECURITY DEFINER).
--   2. apply_confirmed_specialty_rips_service_to_encounter() — the one
--      sanctioned write path for encounter_services.grupo_servicios_code/
--      cod_servicio_code on an already-finalized encounter.


-- ============================================================
-- 1. encounter_service_rips_corrections — append-only audit trail
-- ============================================================
-- Lets a later reviewer (or the clinic itself, or a MUV dispute) always
-- answer "was this Servicio RIPS value the one originally captured at
-- finalize time, or an administrative correction applied afterward, by
-- whom, and when, and what did it change from/to" — nothing on
-- encounter_services itself can answer that (no updated_at trigger, no
-- actor column; correct_finalized_encounter_rips_gaps's own two fields
-- have the exact same pre-existing gap, out of scope to fix here).
--
-- Plain (non-composite) FKs on purpose: encounter_service_id/clinic_id
-- are NOT tied together by a composite FK the way
-- patient_clinical_encounters_patient_clinic_fk ties patient_id+clinic_id
-- — there is no other write path onto this table at all (no INSERT
-- policy/grant to `authenticated`, see below), so tenant consistency
-- between the two is guaranteed by the one RPC that ever writes here,
-- never by a client-reachable insert a composite FK would need to guard.
--
-- ON DELETE RESTRICT on both parent FKs, deliberately NOT cascade: this
-- is a regulatory audit trail, not operational/config data — its whole
-- purpose is to survive and explain a change to
-- encounter_services.grupo_servicios_code/cod_servicio_code made AFTER
-- finalization, so it must never silently disappear if its parent
-- encounter_service or clinic is ever deleted (neither has a real DELETE
-- path anywhere in this schema today — no DELETE policy/RPC exists for
-- either — but RESTRICT costs nothing now and protects the trail if one
-- is ever added later). Same reasoning already used for
-- patients.clinic_id ("a clinic must never be deletable in a way that
-- silently wipes patient records" — foundation schema's own comment),
-- extended here to "...or the regulatory correction history describing
-- what happened to those records' RIPS reporting." corrected_by (below)
-- is the one exception: ON DELETE SET NULL there is correct precisely
-- because that column is nullable and the rest of the event
-- (encounter_service_id, clinic_id, previous/new codes, corrected_at)
-- remains fully meaningful with an anonymized actor — same convention as
-- patient_clinical_encounters.attended_by.
create table public.encounter_service_rips_corrections (
  id uuid primary key default gen_random_uuid(),
  encounter_service_id uuid not null references public.encounter_services (id) on delete restrict,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  -- Whatever was there immediately before this correction — null for
  -- BOTH on every real correction today (the RPC only ever touches a row
  -- where both are currently null, per RIPS_SERVICE_CONFIGURATION_MISSING's
  -- own condition), kept nullable rather than assumed so this table's
  -- shape doesn't silently become wrong if a future correction path ever
  -- fills a previously-partial value.
  previous_grupo_servicios_code text,
  previous_cod_servicio_code text,
  -- What this correction actually set — always non-null: a correction
  -- that resolved to nothing is never inserted at all (see the RPC's own
  -- fail-closed behavior).
  new_grupo_servicios_code text not null,
  new_cod_servicio_code text not null,
  -- Who ran the correction — same on-delete-set-null precedent as
  -- patient_clinical_encounters.attended_by: the audit row must outlive
  -- the actor's own account.
  corrected_by uuid references public.profiles (id) on delete set null,
  corrected_at timestamptz not null default now()
);
-- No updated_at/set_updated_at trigger: this is an append-only log, never
-- edited after insert — an "updated_at" column would imply a mutability
-- this table must never actually have.

create index encounter_service_rips_corrections_encounter_service_id_idx
  on public.encounter_service_rips_corrections (encounter_service_id);
create index encounter_service_rips_corrections_clinic_id_idx
  on public.encounter_service_rips_corrections (clinic_id);

alter table public.encounter_service_rips_corrections enable row level security;
-- Deliberately ZERO policies and ZERO grants to `authenticated`/`anon` —
-- deny-by-default, same convention as specialty_rips_service_defaults'
-- own insert/update stance. Nothing in the current /rips flow reads this
-- log back (the modal shows the CURRENT encounter_services values
-- directly, never correction history) — opening SELECT access here with
-- no real consumer would be exactly the unnecessary widening this task's
-- own instructions warn against. Add a scoped SELECT policy in a later,
-- separate migration if/when a real "historial de correcciones" screen is
-- actually built. The RPC below is the only writer, via SECURITY
-- DEFINER — which bypasses RLS/grants entirely on the function owner's
-- behalf, needing no grant of its own on this table.


-- ============================================================
-- 2. apply_confirmed_specialty_rips_service_to_encounter — the one
--    sanctioned write path for a finalized encounter's own
--    grupo_servicios_code/cod_servicio_code
-- ============================================================
-- Authorization: real, re-derived server-side, never trusted from the
-- page/route guard alone — same shape correct_finalized_encounter_rips_gaps
-- already uses (clinic_id resolved from the encounter's OWN row, never a
-- client parameter; caller must be an ACTIVE clinic_admin of that exact
-- clinic — same is_active_clinical_professional() bypass reasoning: /rips
-- is Clinic Admin only end-to-end already, and requiring clinical
-- capacity here would just reopen "no acción segura" for a
-- solo-admin-without-professional-profile clinic).
--
-- Effective configuration: read EXCLUSIVELY from
-- clinic_specialty_rips_services (never specialty_rips_service_defaults —
-- that table is not even referenced anywhere in this function), and
-- re-validated against the official rips_reference_values catalog itself
-- at APPLICATION time (never trusting a possibly-stale confirmed row: its
-- own Servicio could have been superseded/deprecated in the catalog since
-- it was confirmed) — same integrity requirement
-- confirm_clinic_specialty_rips_service() (20260917100000) already
-- enforces at confirmation time, reapplied here at correction time rather
-- than shared as a helper function (this single COALESCE-free join is
-- simple enough on its own merits not to justify extracting/refactoring
-- that RPC purely for reuse).
--
-- Specialty resolution: encounter_services.professional_profile_id ->
-- professional_profiles.primary_specialty_id, by UUID identity only —
-- never a name/text match anywhere in this function.
--
-- Eligibility matches RIPS_SERVICE_CONFIGURATION_MISSING's own condition
-- EXACTLY (export-readiness.ts: `service.clinicalConceptId &&
-- !service.codServicioCode`) — cod_servicio_code is null, regardless of
-- whether grupo_servicios_code already has a value. Three real shapes:
--   Case A — grupo IS NULL, servicio IS NULL: the normal case. Both
--     columns are set from the confirmed configuration.
--   Case B — grupo IS NOT NULL, servicio IS NULL: some earlier process
--     already froze a Grupo for this service (this can legitimately
--     happen — e.g. a manual "Detalles RIPS" edit before A4/A4B existed).
--     The existing Grupo is compared against the Grupo the confirmed
--     configuration would derive; if they match, the existing Grupo is
--     preserved as-is (the UPDATE below re-writes the identical value —
--     never a behavioral difference, and the audit row honestly shows
--     previous = new for that column) and only cod_servicio_code is
--     filled. If they DIFFER, this is a real inconsistency this function
--     must never paper over — see the fail-closed check below.
--   Case C — servicio IS NOT NULL: not a target of
--     RIPS_SERVICE_CONFIGURATION_MISSING at all (readiness itself already
--     excludes it) — the eligibility WHERE clause below excludes it
--     structurally, never reached by this loop.
--
-- Fail-closed, whole-encounter atomicity: every eligible service is
-- processed in one loop inside one transaction; the moment ANY eligible
-- service can't resolve a confirmed+active configuration, OR its existing
-- Grupo conflicts with the one the confirmed configuration would derive
-- (Case B mismatch), the function RAISEs, which rolls back everything
-- this call had already done (every UPDATE and every audit INSERT from
-- earlier iterations of the SAME call) — never a partial state where one
-- service in the encounter is corrected and a sibling (which, under the
-- current no-co-atención model, always shares the exact same professional
-- and therefore the exact same specialty — see CLAUDE.md's own
-- "Profesional del servicio realizado") is left stuck or inconsistent. An
-- encounter with nothing eligible (already fully corrected, or nothing
-- ever needed correction) is a harmless, real no-op — returns
-- updated_count = 0, never an error.
--
-- Never touches any other column: the UPDATE statement's own column list
-- is the enforcement — cups_code, rips_service_type, performed_at,
-- service_value, clinical_concept_id, the name snapshots,
-- professional_profile_id, and everything on
-- patient_clinical_encounters/patients/appointments are structurally
-- unreachable from this function. FOR UPDATE on the eligibility select
-- guards against a concurrent call over the same encounter double-applying.
create function public.apply_confirmed_specialty_rips_service_to_encounter(p_encounter_id uuid)
returns table (
  encounter_id uuid,
  updated_count integer,
  updated_service_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encounter public.patient_clinical_encounters;
  v_service record;
  v_specialty_id uuid;
  v_servicio record;
  v_grupo_exists boolean;
  v_updated_ids uuid[] := '{}';
  v_updated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'apply_confirmed_specialty_rips_service_to_encounter requires an authenticated session';
  end if;

  select * into v_encounter
  from public.patient_clinical_encounters
  where id = p_encounter_id;

  if v_encounter.id is null then
    raise exception 'encounter not found';
  end if;

  -- clinic_id comes ONLY from the encounter's own row — never a client
  -- parameter (this function has no such parameter at all).
  if not exists (
    select 1 from public.clinic_memberships
    where clinic_id = v_encounter.clinic_id
      and profile_id = auth.uid()
      and status = 'active'
      and role = 'clinic_admin'
  ) then
    raise exception 'only an active clinic_admin can apply this correction' using errcode = '42501';
  end if;

  if v_encounter.finalized_at is null then
    raise exception 'this correction only applies to a finalized encounter' using errcode = '22023';
  end if;

  for v_service in
    select es.id, es.professional_profile_id, es.grupo_servicios_code, es.cod_servicio_code
    from public.encounter_services es
    where es.encounter_id = p_encounter_id
      and es.clinical_concept_id is not null
      and es.cod_servicio_code is null
    for update
  loop
    select pp.primary_specialty_id into v_specialty_id
    from public.professional_profiles pp
    where pp.id = v_service.professional_profile_id;

    if v_specialty_id is null then
      raise exception 'service % has no resolvable specialty for its attending professional', v_service.id
        using errcode = '22023';
    end if;

    select rv.code, rv.parent_code
    into v_servicio
    from public.clinic_specialty_rips_services csrs
    join public.rips_reference_values rv
      on rv.id = csrs.rips_reference_value_id
      and rv.catalog_key = 'Servicios'
      and rv.status = 'active'
    where csrs.clinic_id = v_encounter.clinic_id
      and csrs.specialty_id = v_specialty_id
      and csrs.status = 'active';

    if v_servicio.code is null then
      raise exception 'no confirmed and active Servicio RIPS exists for this encounter''s specialty in this clinic — confirm it in Clínica first'
        using errcode = '22023';
    end if;

    if v_servicio.parent_code is null then
      raise exception 'confirmed Servicio % has no Grupo de servicios in the official catalog', v_servicio.code
        using errcode = '22023';
    end if;

    select exists (
      select 1 from public.rips_reference_values
      where catalog_key = 'GrupoServicios' and code = v_servicio.parent_code and status = 'active'
    ) into v_grupo_exists;

    if not v_grupo_exists then
      raise exception 'Grupo de servicios % is not an active row in the official catalog', v_servicio.parent_code
        using errcode = '22023';
    end if;

    -- Case B conflict check — this service already has a frozen Grupo
    -- (grupo_servicios_code is not null) that DISAGREES with the Grupo
    -- the confirmed configuration derives. Never silently overwrite a
    -- historical value, never complete only the Servicio and leave an
    -- inconsistent Grupo/Servicio pair, and never let this be a partial
    -- correction of the encounter — RAISE here rolls back this entire
    -- call, including any earlier iteration's already-applied UPDATE/audit
    -- INSERT (see this function's own header comment on atomicity).
    if v_service.grupo_servicios_code is not null and v_service.grupo_servicios_code <> v_servicio.parent_code then
      raise exception
        'service % already has Grupo de servicios % frozen, which does not match the Grupo (%) derived from the clinic''s confirmed configuration — refusing to overwrite a historical value',
        v_service.id, v_service.grupo_servicios_code, v_servicio.parent_code
        using errcode = '22023';
    end if;

    insert into public.encounter_service_rips_corrections (
      encounter_service_id, clinic_id,
      previous_grupo_servicios_code, previous_cod_servicio_code,
      new_grupo_servicios_code, new_cod_servicio_code,
      corrected_by
    ) values (
      v_service.id, v_encounter.clinic_id,
      v_service.grupo_servicios_code, v_service.cod_servicio_code,
      v_servicio.parent_code, v_servicio.code,
      auth.uid()
    );

    -- Same eligibility guard as the initial select, restated in the
    -- UPDATE's own WHERE clause — defense in depth against a concurrent
    -- writer between that select and this update (the FOR UPDATE lock
    -- above already prevents it in practice, this is the second,
    -- structural line of defense). cod_servicio_code must still be null;
    -- grupo_servicios_code must be either null (Case A) or already equal
    -- to the value being written (Case B, already proven above) — never
    -- overwrites a frozen Grupo with a different one.
    update public.encounter_services
    set grupo_servicios_code = v_servicio.parent_code,
        cod_servicio_code = v_servicio.code
    where id = v_service.id
      and cod_servicio_code is null
      and (grupo_servicios_code is null or grupo_servicios_code = v_servicio.parent_code);

    v_updated_ids := array_append(v_updated_ids, v_service.id);
    v_updated_count := v_updated_count + 1;
  end loop;

  return query select p_encounter_id, v_updated_count, v_updated_ids;
end;
$$;

revoke execute on function public.apply_confirmed_specialty_rips_service_to_encounter(uuid) from public;
-- authenticated only — never anon: every real authorization check lives
-- INSIDE the function (auth.uid() + active clinic_admin membership),
-- never relied on as RLS-only, consistent with every other write RPC in
-- this schema.
grant execute on function public.apply_confirmed_specialty_rips_service_to_encounter(uuid) to authenticated;
