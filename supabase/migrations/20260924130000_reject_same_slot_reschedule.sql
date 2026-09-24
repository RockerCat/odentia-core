-- Odentia Core — a reschedule request must actually change something.
--
-- Pilot E2E: the Portal's "Reprogramar" picker offered the Cita's own
-- current slot, so a patient could file a "reschedule" to exactly the same
-- professional + date + time. The UI now disables that slot; this is the
-- server-side guard: request_my_appointment_reschedule() rejects it,
-- comparing against the Cita's REAL row (already locked FOR UPDATE here),
-- never a value from the client.
--
-- create or replace of the function exactly as applied by
-- 20260924120000 (same signature → existing EXECUTE grants kept), plus
-- that one check. Ownership, eligible statuses, future-only and the
-- one-pending-per-Cita rule are unchanged. No data touched.

create or replace function public.request_my_appointment_reschedule(
  p_appointment_id uuid,
  p_professional_profile_id uuid,
  p_preferred_starts_at timestamptz
)
returns public.appointment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid;
  v_appointment public.appointments;
  v_request public.appointment_requests;
begin
  v_patient_id := public.my_linked_patient_id();

  select a.* into v_appointment
  from public.appointments a
  where a.id = p_appointment_id
    and a.patient_id = v_patient_id
  for update;

  if not found then
    raise exception 'appointment not found or not yours' using errcode = '42501';
  end if;

  if v_appointment.status not in ('scheduled', 'confirmed') then
    raise exception 'cannot be rescheduled from its current status' using errcode = '22023';
  end if;

  if v_appointment.starts_at <= now() then
    raise exception 'appointment has already occurred' using errcode = '22023';
  end if;

  if p_preferred_starts_at is null or p_preferred_starts_at <= now() then
    raise exception 'preferred date is in the past' using errcode = '22023';
  end if;

  -- Not a real change: the same professional at the exact same time as the
  -- Cita as it stands in the DB (never a client-supplied "current" value).
  -- Another professional at that time, or another time, is a real change.
  if p_professional_profile_id = v_appointment.professional_profile_id
     and date_trunc('minute', p_preferred_starts_at) = date_trunc('minute', v_appointment.starts_at) then
    raise exception 'preferred slot is the same as the current appointment' using errcode = '22023';
  end if;

  if not public.is_bookable_professional(v_appointment.clinic_id, p_professional_profile_id) then
    raise exception 'professional is not available in this clinic' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.appointment_requests r
    where r.appointment_id = v_appointment.id
      and r.status = 'pending'
      and r.kind = 'reschedule'
  ) then
    raise exception 'a pending reschedule request already exists' using errcode = '22023';
  end if;

  insert into public.appointment_requests (
    clinic_id, patient_id, professional_profile_id, preferred_starts_at, kind, appointment_id
  )
  values (
    v_appointment.clinic_id, v_patient_id, p_professional_profile_id, p_preferred_starts_at, 'reschedule', v_appointment.id
  )
  returning * into v_request;

  return v_request;
end;
$$;
