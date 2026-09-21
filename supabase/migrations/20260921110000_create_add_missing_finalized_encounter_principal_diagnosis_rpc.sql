-- Odentia Core — RIPS: narrow, clinically-authorized correction path for
-- a FINALIZED encounter's missing principal diagnosis
-- (ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING, export-readiness.ts), the same
-- historical-correction shape as correct_encounter_service_rips_field
-- (20260921100000, Finalidad/Causa):
--   - add-only: fills an encounter that currently has NO principal
--     diagnosis at all (any scope) — never touches, replaces, or removes
--     an existing diagnosis of any role/scope.
--   - finalized-only: rejects a non-finalized encounter (use
--     upsert_patient_clinical_encounter instead — this is not a second
--     write path for normal clinical documentation).
--   - clinically authorized: is_active_clinical_professional(clinic_id),
--     the SAME gate correct_encounter_service_rips_field uses and for the
--     SAME reason — a principal diagnosis is unambiguously real clinical
--     content (this schema's own normal write path,
--     upsert_patient_clinical_encounter, already requires this exact
--     gate for a diagnosis), never the relaxed clinic_admin-only gate
--     #6D/A4B use for their own genuinely administrative fields. Never
--     requires the encounter's original attending professional — clinical
--     write authority in this schema is clinic-scoped, not
--     professional-scoped. is_platform_superadmin() is never referenced
--     here — being platform Superadmin is never clinical authorship.
--   - catalog-validated: cie10_code against diagnosis_catalog,
--     diagnosis_type_code (when provided) against
--     RIPSTipoDiagnosticoPrincipalVersion2 — the EXACT SAME validation
--     upsert_patient_clinical_encounter already performs for the same two
--     fields, never a stricter or looser rule invented here.
--   - never infers a value: diagnosis_type_code stays nullable at the
--     table level (encounter_diagnoses.diagnosis_type_code, unchanged) —
--     this RPC accepts null and simply doesn't set it, exactly like the
--     normal write path already allows for a non-consultation-only
--     encounter; CONSULTATION_DIAGNOSIS_TYPE_MISSING (a separate,
--     pre-existing readiness check, untouched) still fires afterward if a
--     consultation service needs one and it wasn't provided — this RPC
--     never fabricates Z012, "01", or any other value to make that
--     disappear.
--   - audited, append-only, RPC as sole writer, zero client grants.


-- ============================================================
-- 1. encounter_principal_diagnosis_corrections — append-only audit trail
-- ============================================================
-- Sibling of encounter_service_rips_field_corrections (20260921100000),
-- not a reuse of it: that table's shape is keyed to an
-- encounter_service_id (a field correction on an existing row); this one
-- is keyed to an encounter_id and records the CREATION of a new
-- encounter_diagnoses row — different enough (a real FK to the row it
-- created, no "previous_value" concept at all, since there's nothing to
-- have previously held) to warrant its own table rather than a forced
-- reuse.
create table public.encounter_principal_diagnosis_corrections (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  encounter_id uuid not null,
  -- The exact row this correction created — RESTRICT, not CASCADE: this
  -- schema has no encounter/diagnosis DELETE path anywhere today, but if
  -- one is ever added, the audit trail must still outlive the row it
  -- explains rather than silently disappear with it (same convention as
  -- encounter_service_rips_corrections/encounter_service_rips_field_corrections).
  encounter_diagnosis_id uuid not null references public.encounter_diagnoses (id) on delete restrict,
  cie10_code text not null,
  diagnosis_type_code text,
  -- Same on-delete-set-null precedent as every other correction audit
  -- table's own corrected_by: the audit row must outlive the actor's own
  -- account.
  corrected_by uuid references public.profiles (id) on delete set null,
  corrected_at timestamptz not null default now()
);
-- No updated_at/set_updated_at trigger: append-only, never edited after
-- insert, same convention as every other correction audit table.

create index encounter_principal_diagnosis_corrections_encounter_id_idx
  on public.encounter_principal_diagnosis_corrections (encounter_id);
create index encounter_principal_diagnosis_corrections_clinic_id_idx
  on public.encounter_principal_diagnosis_corrections (clinic_id);

alter table public.encounter_principal_diagnosis_corrections enable row level security;
-- Deliberately ZERO policies and ZERO grants to `authenticated`/`anon` —
-- deny-by-default, identical stance to every other correction audit
-- table in this schema. No "historial de correcciones" UI reads this
-- back in this checkpoint — a scoped SELECT policy is a later, separate
-- migration if/when that screen is actually built. The RPC below is the
-- only writer, via SECURITY DEFINER, which needs no grant of its own on
-- this table.


-- ============================================================
-- 2. add_missing_finalized_encounter_principal_diagnosis — the one
--    sanctioned write path for adding a principal diagnosis to an
--    already-finalized encounter that currently has none
-- ============================================================
create function public.add_missing_finalized_encounter_principal_diagnosis(
  p_encounter_id uuid,
  p_cie10_code text,
  p_diagnosis_type_code text default null
)
returns public.encounter_diagnoses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encounter public.patient_clinical_encounters;
  v_result public.encounter_diagnoses;
  v_next_sequence integer;
begin
  if auth.uid() is null then
    raise exception 'add_missing_finalized_encounter_principal_diagnosis requires an authenticated session';
  end if;

  select * into v_encounter
  from public.patient_clinical_encounters
  where id = p_encounter_id;

  if v_encounter.id is null then
    raise exception 'encounter not found';
  end if;

  -- Clinical authorization, re-derived server-side, never trusted from
  -- the caller — same gate/reasoning as correct_encounter_service_rips_field
  -- (see this migration's own header comment).
  if not public.is_active_clinical_professional(v_encounter.clinic_id) then
    raise exception 'only an active clinical professional of this clinic can add a principal diagnosis' using errcode = '42501';
  end if;

  if v_encounter.finalized_at is null then
    raise exception 'this correction only applies to a finalized encounter' using errcode = '22023';
  end if;

  -- Missing-only: reject if ANY principal diagnosis already exists for
  -- this encounter, in ANY scope (encounter-wide or service-scoped) —
  -- never overwrite, never add a second one. This RPC only ever inserts
  -- the encounter-wide principal (encounter_service_id null), matching
  -- the current MVP model (CLAUDE.md: "the current MVP UI only ever
  -- offers ONE principal diagnosis row, and it is always encounter-wide")
  -- — a service-scoped principal is a future-phase concept this
  -- correction surface does not need to handle.
  if exists (
    select 1 from public.encounter_diagnoses
    where encounter_id = p_encounter_id and role = 'principal'
  ) then
    raise exception 'this encounter already has a principal diagnosis — this function only fills a missing one' using errcode = '22023';
  end if;

  if p_cie10_code is null or btrim(p_cie10_code) = '' then
    raise exception 'cie10_code is required';
  end if;

  -- Same catalog check upsert_patient_clinical_encounter already performs
  -- for this exact field — never a stricter or looser rule.
  if not exists (
    select 1 from public.diagnosis_catalog
    where classification_system = 'CIE10' and code = p_cie10_code and status = 'active'
  ) then
    raise exception 'cie10_code % does not exist in the official CIE10 catalog', p_cie10_code using errcode = '22023';
  end if;

  -- diagnosis_type_code stays optional here, same as the table's own
  -- column and upsert_patient_clinical_encounter's own conditional check
  -- — never inferred, never defaulted (not even for a Z0xx code):
  -- validated ONLY when the caller actually provides one.
  if p_diagnosis_type_code is not null and not exists (
    select 1 from public.rips_reference_values
    where catalog_key = 'RIPSTipoDiagnosticoPrincipalVersion2' and code = p_diagnosis_type_code and status = 'active'
  ) then
    raise exception 'diagnosis_type_code % does not exist in the official RIPSTipoDiagnosticoPrincipalVersion2 catalog', p_diagnosis_type_code
      using errcode = '22023';
  end if;

  select coalesce(max(sequence) + 1, 0) into v_next_sequence
  from public.encounter_diagnoses
  where encounter_id = p_encounter_id;

  insert into public.encounter_diagnoses (
    encounter_id, clinic_id, cie10_code, role, diagnosis_type_code, encounter_service_id, sequence
  ) values (
    p_encounter_id, v_encounter.clinic_id, p_cie10_code, 'principal', p_diagnosis_type_code, null, v_next_sequence
  )
  returning * into v_result;

  insert into public.encounter_principal_diagnosis_corrections (
    clinic_id, encounter_id, encounter_diagnosis_id, cie10_code, diagnosis_type_code, corrected_by
  ) values (
    v_encounter.clinic_id, p_encounter_id, v_result.id, p_cie10_code, p_diagnosis_type_code, auth.uid()
  );

  return v_result;
end;
$$;

revoke execute on function public.add_missing_finalized_encounter_principal_diagnosis(uuid, text, text) from public;
-- authenticated only — never anon: every real authorization check lives
-- INSIDE the function (auth.uid() + is_active_clinical_professional()),
-- same convention as every other write RPC in this schema.
grant execute on function public.add_missing_finalized_encounter_principal_diagnosis(uuid, text, text) to authenticated;
