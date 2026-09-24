-- Odentia Core — retire "Necesito reprogramar" (need_reschedule) as a
-- motivo for NEW Portal cancellations.
--
-- Product decision 2026-09-24: the Portal's own "Reprogramar" flow covers
-- it, so it's no longer a way to cancel. cancel_my_appointment() now accepts
-- only cannot_attend / personal / other ("Otro" still requires detail).
--
-- Deliberately NOT touched: the appointments_cancellation_reason_code_check
-- constraint still allows need_reschedule, so any Cita that already stores
-- it stays valid and readable (no backfill, no UPDATE of existing rows).
--
-- create or replace of the function exactly as applied by 20260924120000
-- (same signature → EXECUTE grants kept), changing only the allowed list.

create or replace function public.cancel_my_appointment(
  p_appointment_id uuid,
  p_reason_code text,
  p_reason_detail text
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid;
  v_appointment public.appointments;
  v_detail text := nullif(btrim(coalesce(p_reason_detail, '')), '');
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
    raise exception 'cannot be cancelled from its current status' using errcode = '22023';
  end if;

  if v_appointment.starts_at <= now() then
    raise exception 'appointment has already occurred' using errcode = '22023';
  end if;

  if p_reason_code is null or p_reason_code not in ('cannot_attend', 'personal', 'other') then
    raise exception 'invalid cancellation reason' using errcode = '22023';
  end if;

  if p_reason_code = 'other' and v_detail is null then
    raise exception 'cancellation reason detail is required' using errcode = '22023';
  end if;

  update public.appointments
  set status = 'cancelled',
      cancellation_reason_code = p_reason_code,
      cancellation_reason_detail = case when p_reason_code = 'other' then v_detail else null end,
      cancelled_by = 'patient'
  where id = v_appointment.id
  returning * into v_appointment;

  update public.appointment_requests
  set status = 'rejected'
  where appointment_id = v_appointment.id
    and kind = 'reschedule'
    and status = 'pending';

  return v_appointment;
end;
$$;
