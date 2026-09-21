-- Odentia Core — RIPS: narrow, clinically-authorized correction path for
-- a FINALIZED encounter's missing finalidad_code/causa_motivo_code
-- (encounter_services), the exact gaps SERVICE_FINALIDAD_MISSING/
-- CONSULTATION_CAUSA_MOTIVO_MISSING (export-readiness.ts, prior
-- checkpoint) now block RIPS generation on.
--
-- Precedents this deliberately mirrors, and the one place it diverges:
--   - correct_finalized_encounter_rips_gaps (20260912100000) — same
--     "NULL -> explicit value only" mutation shape (never overwrite,
--     never reopen the encounter, never touch anything but the one named
--     field), same "encounter must already be finalized_at is not null"
--     gate, same fail-closed catalog-membership validation.
--   - apply_confirmed_specialty_rips_service_to_encounter (20260917110000,
--     "A4B") — same append-only audit-table convention (own table, RPC
--     the sole writer, zero client grants/policies, ON DELETE RESTRICT on
--     the parent FKs so the trail outlives the row it explains).
--   - DIVERGES from both on authorization, deliberately: #6D/A4B both
--     gate on a plain active `clinic_admin` membership, explicitly
--     because their own fields (a Sí/No incapacidad flag, a peso amount,
--     an institutionally-derived Servicio RIPS code) are administrative,
--     never a diagnosis/treatment/procedure — and both migrations'
--     own comments say so explicitly, including "never treat this
--     function's gate as precedent for any other clinical write."
--     finalidad_code/causa_motivo_code are different in kind: CLAUDE.md
--     itself calls Finalidad "a real clinical decision, never inferred,"
--     and their NORMAL (pre-finalization) write path already goes
--     through upsert_patient_clinical_encounter's own
--     is_active_clinical_professional() gate — the same tier as a
--     diagnosis. This RPC uses that SAME gate, not the relaxed
--     clinic_admin-only one #6D/A4B use for their own, genuinely
--     administrative fields. A platform Superadmin is never a clinical
--     author by virtue of being Superadmin — is_platform_superadmin() is
--     never referenced here, on purpose (see CLAUDE.md's own Superadmin
--     section: platform administration is a separate authorization
--     plane, never a backdoor into clinic-scoped clinical writes).
--
-- No cross-validation engine: this RPC validates field name, service
-- classification (causa_motivo_code only ever applies to a consultation —
-- same rips_service_type check the table's own
-- encounter_services_causa_motivo_only_for_consultation CHECK already
-- enforces structurally), catalog membership, and missing-only semantics.
-- It does NOT enforce DT1's own Finalidad<->Causa cross-validation matrix
-- (e.g. "promoción y mantenimiento" -> Causa 40) — that engine doesn't
-- exist anywhere in this codebase today (the one confirmed pairing is a
-- client-side UX nudge only, finalidad-causa.ts, never enforced
-- server-side) and building it is explicitly out of this checkpoint's
-- scope. The professional corrects the ACTUAL Finalidad/Causa for this
-- historical encounter; Odentia never infers one from the other here.


-- ============================================================
-- 1. encounter_service_rips_field_corrections — append-only audit trail
-- ============================================================
-- Sibling of encounter_service_rips_corrections (A4B), not an extension
-- of it: that table's shape is fixed to exactly two columns
-- (grupo_servicios_code/cod_servicio_code, both always non-null on every
-- real correction it records) because its RPC always derives BOTH from
-- one resolved configuration in one call. This correction is the
-- opposite shape — ONE explicit field, ONE explicit value, chosen by a
-- real clinical professional, never derived — so a generic
-- `field`/`previous_value`/`new_value` row is the honest shape, not a
-- forced reuse of A4B's fixed two-column one.
create table public.encounter_service_rips_field_corrections (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  encounter_service_id uuid not null references public.encounter_services (id) on delete restrict,
  field text not null check (field in ('finalidad_code', 'causa_motivo_code')),
  -- Always null on every real correction today (the RPC only ever fills a
  -- currently-null field) — kept nullable rather than assumed, same
  -- reasoning as A4B's own previous_* columns, so this table's shape
  -- doesn't silently become wrong if a future correction path ever fills
  -- a previously-partial value.
  previous_value text,
  new_value text not null,
  -- Same on-delete-set-null precedent as encounter_service_rips_corrections.corrected_by
  -- / patient_clinical_encounters.attended_by — the audit row must
  -- outlive the actor's own account.
  corrected_by uuid references public.profiles (id) on delete set null,
  corrected_at timestamptz not null default now()
);
-- No updated_at/set_updated_at trigger: append-only, never edited after
-- insert, same convention as encounter_service_rips_corrections.

create index encounter_service_rips_field_corrections_service_id_idx
  on public.encounter_service_rips_field_corrections (encounter_service_id);
create index encounter_service_rips_field_corrections_clinic_id_idx
  on public.encounter_service_rips_field_corrections (clinic_id);

alter table public.encounter_service_rips_field_corrections enable row level security;
-- Deliberately ZERO policies and ZERO grants to `authenticated`/`anon` —
-- deny-by-default, identical stance to encounter_service_rips_corrections.
-- Nothing in /rips reads this log back today (the modal below shows the
-- CURRENT encounter_services values, never correction history) — a
-- scoped SELECT policy is a later, separate migration if/when a real
-- "historial de correcciones" screen is actually built (same deferred
-- decision A4B's own table already made, restated here rather than
-- solved differently). The RPC below is the only writer, via SECURITY
-- DEFINER, which needs no grant of its own on this table.


-- ============================================================
-- 2. correct_encounter_service_rips_field — the one sanctioned write
--    path for encounter_services.finalidad_code/causa_motivo_code on an
--    already-finalized encounter
-- ============================================================
create function public.correct_encounter_service_rips_field(
  p_service_id uuid,
  p_field text,
  p_value text
)
returns public.encounter_services
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.encounter_services;
  v_encounter public.patient_clinical_encounters;
  v_current_value text;
  v_catalog_key text;
begin
  if auth.uid() is null then
    raise exception 'correct_encounter_service_rips_field requires an authenticated session';
  end if;

  select * into v_service
  from public.encounter_services
  where id = p_service_id;

  if v_service.id is null then
    raise exception 'service not found';
  end if;

  select * into v_encounter
  from public.patient_clinical_encounters
  where id = v_service.encounter_id
    and clinic_id = v_service.clinic_id;

  if v_encounter.id is null then
    raise exception 'service not found';
  end if;

  -- Clinical authorization, re-derived server-side, never trusted from
  -- the caller — is_active_clinical_professional() is the SAME gate
  -- upsert_patient_clinical_encounter() already uses for this exact
  -- field pre-finalization (see this migration's own header comment on
  -- why #6D/A4B's relaxed clinic_admin-only gate is the wrong one here).
  -- Deliberately no "must be the original attending professional" check
  -- — clinical write authority in this schema is clinic-scoped, not
  -- professional-scoped (CLAUDE.md's own Dentist/Clinic Admin notes: any
  -- active clinical professional may author/edit clinical documentation
  -- for any patient in the clinic).
  if not public.is_active_clinical_professional(v_service.clinic_id) then
    raise exception 'only an active clinical professional of this clinic can correct RIPS clinical data' using errcode = '42501';
  end if;

  if v_encounter.finalized_at is null then
    raise exception 'this correction only applies to a finalized encounter' using errcode = '22023';
  end if;

  if p_field not in ('finalidad_code', 'causa_motivo_code') then
    raise exception 'unsupported field %', p_field using errcode = '22023';
  end if;

  if p_field = 'causa_motivo_code' and v_service.rips_service_type <> 'consultation' then
    raise exception 'causa_motivo_code only applies to a consultation-classified service (service %)', p_service_id
      using errcode = '22023';
  end if;

  if p_field = 'finalidad_code' then
    v_current_value := v_service.finalidad_code;
    v_catalog_key := 'RIPSFinalidadConsultaVersion2';
  else
    v_current_value := v_service.causa_motivo_code;
    v_catalog_key := 'RIPSCausaExternaVersion2';
  end if;

  if v_current_value is not null then
    raise exception '% is already set for service % — this function only fills missing information on a finalized encounter', p_field, p_service_id
      using errcode = '22023';
  end if;

  if p_value is null or btrim(p_value) = '' then
    raise exception 'a value is required';
  end if;

  if not exists (
    select 1 from public.rips_reference_values
    where catalog_key = v_catalog_key and code = p_value and status = 'active'
  ) then
    raise exception '% is not an active code in the official % catalog', p_value, v_catalog_key using errcode = '22023';
  end if;

  insert into public.encounter_service_rips_field_corrections (
    clinic_id, encounter_service_id, field, previous_value, new_value, corrected_by
  ) values (
    v_service.clinic_id, p_service_id, p_field, v_current_value, p_value, auth.uid()
  );

  if p_field = 'finalidad_code' then
    update public.encounter_services
    set finalidad_code = p_value
    where id = p_service_id
      and finalidad_code is null
    returning * into v_service;
  else
    update public.encounter_services
    set causa_motivo_code = p_value
    where id = p_service_id
      and causa_motivo_code is null
    returning * into v_service;
  end if;

  if v_service.id is null then
    -- Lost a race against a concurrent correction of the SAME field
    -- between the guard above and this UPDATE — the audit row already
    -- inserted for THIS call is rolled back along with everything else
    -- (same transaction), so no orphaned/incorrect audit entry survives.
    raise exception '% was set concurrently for service % — reload and try again', p_field, p_service_id using errcode = '40001';
  end if;

  return v_service;
end;
$$;

revoke execute on function public.correct_encounter_service_rips_field(uuid, text, text) from public;
-- authenticated only — never anon: every real authorization check lives
-- INSIDE the function (auth.uid() + is_active_clinical_professional()),
-- same convention as every other write RPC in this schema.
grant execute on function public.correct_encounter_service_rips_field(uuid, text, text) to authenticated;
