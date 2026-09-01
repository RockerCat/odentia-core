-- Odentia Core — link patient_clinical_encounters to the originating Cita
--
-- "Finalizar atención" (src/features/dashboard/real-clinical-encounter-screen.tsx)
-- writes one encounter per real appointment. Without a structural link back
-- to public.appointments, nothing actually prevented two encounter rows for
-- the same Cita (a retried "Finalizar atención" after a partial failure, or
-- two browser tabs finalizing concurrently), and there was no way to ask
-- "does this Cita already have its encounter recorded" without a full table
-- scan. appointment_id closes that gap — see
-- insert_patient_clinical_encounter's own original comment on why this was
-- deliberately deferred until a real Agenda integration existed.
--
-- Nullable: historical/manual encounters (entered directly, with no
-- originating Cita) keep appointment_id null — this column only applies to
-- encounters created by finalizing a real appointment.

-- Composite (id, clinic_id) unique constraint on appointments — same
-- structural tenant-consistency pattern already used for
-- professional_profiles/patients/clinic_memberships (see the appointments
-- migration's own comment on professional_profiles_id_clinic_id_key). Lets
-- the FK below enforce "this encounter's appointment really belongs to this
-- encounter's clinic" at the schema level, not just inside the RPC.
alter table public.appointments
  add constraint appointments_id_clinic_id_key unique (id, clinic_id);

alter table public.patient_clinical_encounters
  add column appointment_id uuid;

alter table public.patient_clinical_encounters
  add constraint patient_clinical_encounters_appointment_clinic_fk
  foreign key (appointment_id, clinic_id)
  references public.appointments (id, clinic_id)
  on delete set null;

-- Doubles as both the "look up this Cita's encounter" index and the "at
-- most one encounter per Cita" guarantee. Partial so historical/manual
-- encounters (appointment_id null) are never compared against each other —
-- Postgres unique indexes already treat NULL as distinct from NULL, this
-- `where` just makes that intent explicit.
create unique index patient_clinical_encounters_appointment_id_key
  on public.patient_clinical_encounters (appointment_id)
  where appointment_id is not null;

-- Re-created (not CREATE OR REPLACE) because adding a parameter changes the
-- function's argument-type signature — Postgres would otherwise create a
-- second overload alongside the old one instead of replacing it.
drop function if exists public.insert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text);

-- Register one encounter — now idempotent by appointment_id: a retried
-- "Finalizar atención" (after the Cita's own completed-status write failed)
-- or two concurrent finalizes for the same Cita must return the SAME row,
-- never insert a second one. The partial unique index above is the actual
-- guarantee under concurrency; the pre-check below just avoids raising an
-- avoidable error in the common sequential-retry case. p_appointment_id
-- stays optional (default null) so manual/historical encounters keep
-- working unchanged.
create function public.insert_patient_clinical_encounter(
  p_patient_id uuid,
  p_occurred_at timestamptz,
  p_reason text,
  p_diagnosis text,
  p_treatment text,
  p_notes text,
  p_appointment_id uuid default null
)
returns public.patient_clinical_encounters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
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
    select * into v_result
    from public.patient_clinical_encounters
    where appointment_id = p_appointment_id;
    if found then
      return v_result;
    end if;

    -- The appointment must actually belong to this same patient/clinic —
    -- never trust the caller's pairing blindly, same as the composite FK
    -- above but checked here too for a clean error instead of a raw FK
    -- violation.
    if not exists (
      select 1 from public.appointments
      where id = p_appointment_id
        and patient_id = p_patient_id
        and clinic_id = v_clinic_id
    ) then
      raise exception 'appointment does not match patient/clinic';
    end if;
  end if;

  begin
    insert into public.patient_clinical_encounters (
      clinic_id, patient_id, appointment_id, occurred_at, reason, diagnosis, treatment, notes, attended_by
    )
    values (
      v_clinic_id, p_patient_id, p_appointment_id, coalesce(p_occurred_at, now()), p_reason, p_diagnosis, p_treatment, p_notes, auth.uid()
    )
    returning * into v_result;
  exception
    when unique_violation then
      -- Lost the race to a concurrent finalize for the same appointment_id
      -- — return its row instead of failing; this call is meant to be
      -- idempotent by appointment_id, not merely retry-safe.
      select * into v_result
      from public.patient_clinical_encounters
      where appointment_id = p_appointment_id;
  end;

  return v_result;
end;
$$;

revoke execute on function public.insert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text, uuid) from public;
grant execute on function public.insert_patient_clinical_encounter(uuid, timestamptz, text, text, text, text, uuid) to authenticated;
