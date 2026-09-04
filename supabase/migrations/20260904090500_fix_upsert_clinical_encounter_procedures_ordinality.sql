-- Odentia Core — fix a real, currently-live crash in
-- upsert_patient_clinical_encounter (20260903120000, patched by
-- 20260903121500) whenever it's called with at least one procedure.
--
-- Found by directly executing the exact procedures-insert query against
-- the live remote database (not by reading the code): `jsonb_array_elements(
-- p_procedures) WITH ORDINALITY AS item` — a single BARE alias after
-- WITH ORDINALITY — does NOT bind `item` to the jsonb element as intended.
-- Postgres instead binds it to a RECORD combining the element AND the
-- ordinality number together, so `item ->> 'name'` fails with "42883:
-- operator does not exist: record ->> unknown". Confirmed directly:
-- `select pg_typeof(item) from jsonb_array_elements(...) with ordinality
-- as item` returns `record`, not `jsonb`. The fix — an explicit column
-- list, `... WITH ORDINALITY AS t(item, ord)` — makes Postgres split the
-- element and the ordinality into two separate, correctly-typed columns.
--
-- Real-world impact: this function is called by BOTH "Guardar borrador"
-- and "Finalizar atención" (clinical-encounters-actions.ts). With an
-- EMPTY procedures array, jsonb_array_elements returns zero rows and the
-- broken expression never actually executes — no error, which is exactly
-- why this went unnoticed: only Vitest-covered pure JS helpers
-- (buildProceduresPayload et al.) and manual testing without adding a
-- procedure ever exercised this path before. The moment a real call
-- includes at least one procedure name, the entire save fails with a
-- visible "No pudimos guardar la atención" error
-- (clinical-encounters-actions.ts's own generic-error mapping) — every
-- previous "Guardar borrador"/"Finalizar atención" that included a
-- procedure has been failing outright, not silently.
--
-- Same-signature CREATE OR REPLACE, identical to the 20260903121500 fix
-- otherwise — only the WITH ORDINALITY clause and its two references
-- change.
create or replace function public.upsert_patient_clinical_encounter(
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

        if v_result.finalized_at is not null then
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
    end;
  end if;

  -- Replace the encounter's full procedure list atomically — the UI always
  -- sends the complete current set, never a partial patch, so a wholesale
  -- delete+reinsert (not a diff) is the simplest correct match for that
  -- shape and can never leave a stale row behind. Empty/blank names are
  -- dropped rather than persisted as noise. Never reached for an
  -- already-finalized row (both branches above return early in that case).
  delete from public.patient_clinical_encounter_procedures where encounter_id = v_result.id;

  insert into public.patient_clinical_encounter_procedures (encounter_id, clinic_id, name, note, position)
  select v_result.id, v_clinic_id, item ->> 'name', item ->> 'note', ord - 1
  from jsonb_array_elements(coalesce(p_procedures, '[]'::jsonb)) with ordinality as t(item, ord)
  where coalesce(item ->> 'name', '') <> '';

  return v_result;
end;
$$;

revoke execute on function public.upsert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text, text, jsonb, uuid, boolean) from public;
grant execute on function public.upsert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text, text, jsonb, uuid, boolean) to authenticated;
