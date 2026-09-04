-- Odentia Core — Atención Clínica: draft/finalized state, Indicaciones al
-- paciente, and structured Procedimientos realizados
--
-- Closes the gap where "Guardar borrador"/"Procedimientos realizados"/
-- "Indicaciones al paciente" in RealClinicalEncounterScreen were session-
-- only local state — a refresh, a closed tab, or navigating away before
-- "Finalizar atención" silently discarded everything typed. This migration
-- lets patient_clinical_encounters represent an in-progress draft (created
-- by "Guardar borrador", updated in place — never duplicated — on every
-- subsequent save) that only becomes a real, immutable clinical record
-- once finalized_at is set by "Finalizar atención".
--
-- finalized_at (nullable timestamptz) IS the draft/finalized state itself
-- — the same additive-nullable-timestamp idiom already used everywhere
-- else in this schema for a two-state flag (patient_arrived_at on
-- appointments, archived_at on patient_clinical_documents) rather than a
-- separate status enum/column.
alter table public.patient_clinical_encounters
  add column indications text,
  add column finalized_at timestamptz;

-- Every row created before this migration was inserted by the OLD
-- insert-only RPC, which only ever ran once "Finalizar atención" already
-- succeeded — so every existing row is retroactively finalized at its own
-- occurred_at, never left stranded as an invisible draft (Historia
-- Clínica's Atenciones tab / PDF export only ever show finalized rows from
-- here on, see fetchPatientClinicalEncounters).
update public.patient_clinical_encounters set finalized_at = occurred_at where finalized_at is null;

-- Structured procedures realized during an atención — one row per
-- procedure (name + optional note), not a JSON blob and not the lossy
-- joined-names string patient_clinical_encounters.treatment already
-- carries for display elsewhere (Historia Clínica/PDF, both unchanged,
-- still just read .treatment as plain text). This table is the source of
-- truth RealClinicalEncounterScreen reconstructs its procedure rows FROM
-- on refresh/"Continuar atención"; .treatment stays an auto-derived
-- convenience summary, written by the same RPC below.
--
-- Composite (encounter_id, clinic_id) FK — same structural tenant-
-- consistency pattern as every other child table in this schema
-- (appointments_id_clinic_id_key, professional_profiles_id_clinic_id_key)
-- — a procedure row can never structurally drift to a different clinic
-- than its own encounter.
alter table public.patient_clinical_encounters
  add constraint patient_clinical_encounters_id_clinic_id_key unique (id, clinic_id);

create table public.patient_clinical_encounter_procedures (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  name text not null,
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint patient_clinical_encounter_procedures_encounter_clinic_fk
    foreign key (encounter_id, clinic_id)
    references public.patient_clinical_encounters (id, clinic_id)
    on delete cascade
);

create index patient_clinical_encounter_procedures_encounter_id_idx
  on public.patient_clinical_encounter_procedures (encounter_id);

alter table public.patient_clinical_encounter_procedures enable row level security;

-- Same read scope as the parent table — any active clinic member.
create policy patient_clinical_encounter_procedures_select_member
  on public.patient_clinical_encounter_procedures for select
  to authenticated
  using (public.is_clinic_member(clinic_id));
-- No direct INSERT/UPDATE/DELETE policy — same reasoning as the parent
-- table: only ever written by upsert_patient_clinical_encounter() below,
-- which replaces an encounter's full procedure list atomically on every
-- draft save/finalize (the UI always edits the whole set client-side, so
-- diffing individual rows would add complexity nothing here needs).
grant select on public.patient_clinical_encounter_procedures to authenticated;

-- Replaces insert_patient_clinical_encounter (drop, not CREATE OR REPLACE:
-- the signature changes materially — this is now an upsert, called on
-- every "Guardar borrador" AND "Finalizar atención", not just once at the
-- very end).
drop function if exists public.insert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text, uuid);

-- Idempotent by appointment_id (same guarantee as before): the first call
-- for a given appointment_id creates the draft row; every subsequent call
-- (another "Guardar borrador", or "Finalizar atención") UPDATES that same
-- row in place, never inserts a second one. Once finalized_at is set, the
-- row is treated as immutable — a later call (a stray retry, or a second
-- browser tab) returns it unchanged rather than overwriting a real
-- clinical record, which is what makes "Finalizar atención" safe to click
-- twice.
--
-- Write authorization is clinic-wide (is_active_clinical_professional,
-- unchanged below) by deliberate product decision: any active Dentist or
-- clinically-active Clinic Admin may register/edit clinical data for any
-- patient in their own clinic — never restricted to "assigned to this
-- professional." The only mandatory isolation boundary is clinic_id.
--
-- p_procedures is a jsonb array of {"name": text, "note": text|null} —
-- purely a transport shape for this call (Postgres/PostgREST has no clean
-- way to pass a list of records otherwise); it is immediately unpacked
-- into patient_clinical_encounter_procedures rows below, never stored as
-- JSON.
create function public.upsert_patient_clinical_encounter(
  p_patient_id uuid,
  p_occurred_at timestamptz,
  p_reason text,
  p_diagnosis text,
  p_treatment text,
  p_notes text,
  p_indications text,
  p_procedures jsonb,
  p_appointment_id uuid default null,
  p_finalize boolean default false
)
returns public.patient_clinical_encounters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_existing_id uuid;
  v_result public.patient_clinical_encounters;
begin
  select clinic_id into v_clinic_id from public.patients where id = p_patient_id;
  if v_clinic_id is null then
    raise exception 'patient not found';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit clinical data for this clinic' using errcode = '42501';
  end if;

  if p_appointment_id is not null then
    if not exists (
      select 1 from public.appointments
      where id = p_appointment_id and patient_id = p_patient_id and clinic_id = v_clinic_id
    ) then
      raise exception 'appointment does not match patient/clinic';
    end if;

    select id into v_existing_id
    from public.patient_clinical_encounters
    where appointment_id = p_appointment_id;
  end if;

  if v_existing_id is not null then
    select * into v_result from public.patient_clinical_encounters where id = v_existing_id;

    if v_result.finalized_at is not null then
      -- Already finalized — a real clinical record, never silently
      -- overwritten by a stray retry/second tab. Return it as-is; the
      -- caller (handleFinalize) only needs the row to proceed to
      -- completing the Cita.
      return v_result;
    end if;

    update public.patient_clinical_encounters
    set reason = p_reason,
        diagnosis = p_diagnosis,
        treatment = p_treatment,
        notes = p_notes,
        indications = p_indications,
        attended_by = auth.uid(),
        finalized_at = case when p_finalize then now() else null end
    where id = v_existing_id
    returning * into v_result;
  else
    begin
      insert into public.patient_clinical_encounters (
        clinic_id, patient_id, appointment_id, occurred_at, reason, diagnosis,
        treatment, notes, indications, attended_by, finalized_at
      )
      values (
        v_clinic_id, p_patient_id, p_appointment_id, coalesce(p_occurred_at, now()),
        p_reason, p_diagnosis, p_treatment, p_notes, p_indications, auth.uid(),
        case when p_finalize then now() else null end
      )
      returning * into v_result;
    exception
      when unique_violation then
        -- Lost the race to a concurrent draft-save/finalize for the same
        -- appointment_id — fall into the update path instead of failing,
        -- so this call stays idempotent under concurrency too.
        select id into v_existing_id
        from public.patient_clinical_encounters
        where appointment_id = p_appointment_id;

        select * into v_result from public.patient_clinical_encounters where id = v_existing_id;
        if v_result.finalized_at is null then
          update public.patient_clinical_encounters
          set reason = p_reason,
              diagnosis = p_diagnosis,
              treatment = p_treatment,
              notes = p_notes,
              indications = p_indications,
              attended_by = auth.uid(),
              finalized_at = case when p_finalize then now() else null end
          where id = v_existing_id
          returning * into v_result;
        end if;
    end;
  end if;

  -- Replace the encounter's full procedure list atomically — the UI always
  -- sends the complete current set, never a partial patch, so a wholesale
  -- delete+reinsert (not a diff) is the simplest correct match for that
  -- shape and can never leave a stale row behind. Empty/blank names are
  -- dropped rather than persisted as noise.
  delete from public.patient_clinical_encounter_procedures where encounter_id = v_result.id;

  insert into public.patient_clinical_encounter_procedures (encounter_id, clinic_id, name, note, position)
  select v_result.id, v_clinic_id, item ->> 'name', item ->> 'note', ordinality - 1
  from jsonb_array_elements(coalesce(p_procedures, '[]'::jsonb)) with ordinality as item
  where coalesce(item ->> 'name', '') <> '';

  return v_result;
end;
$$;

revoke execute on function public.upsert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text, text, jsonb, uuid, boolean) from public;
grant execute on function public.upsert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text, text, jsonb, uuid, boolean) to authenticated;
