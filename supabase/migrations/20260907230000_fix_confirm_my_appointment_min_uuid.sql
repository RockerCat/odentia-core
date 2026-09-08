-- Odentia Core — fix confirm_my_appointment: `min(uuid)` is not a valid
-- Postgres aggregate (no ordering operator class for uuid), so the
-- previous version's `select count(*), min(l.patient_id) into ...` failed
-- outright with "function min(uuid) does not exist" — caught live during
-- QA before any real patient ever hit it. Same logic, split into two plain
-- scalar queries instead of one aggregate query.
create or replace function public.confirm_my_appointment(p_appointment_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_link_count integer;
  v_patient_id uuid;
  v_appointment public.appointments;
begin
  select count(*) into v_link_count
  from public.patient_user_links l
  where l.profile_id = auth.uid();

  if v_link_count is null or v_link_count = 0 then
    raise exception 'no linked patient for this account' using errcode = '42501';
  end if;

  -- Same "never silently pick one" rule as resolve-patient-context.ts's own
  -- multiple-links handling — an ambiguous account is rejected outright,
  -- never resolved to an arbitrary patient.
  if v_link_count > 1 then
    raise exception 'ambiguous patient link for this account' using errcode = '42501';
  end if;

  select l.patient_id into v_patient_id
  from public.patient_user_links l
  where l.profile_id = auth.uid()
  limit 1;

  select a.* into v_appointment
  from public.appointments a
  where a.id = p_appointment_id
    and a.patient_id = v_patient_id
  for update;

  if not found then
    raise exception 'appointment not found or not yours' using errcode = '42501';
  end if;

  if v_appointment.status <> 'scheduled' then
    raise exception 'cannot be confirmed from its current status' using errcode = '22023';
  end if;

  if v_appointment.starts_at < now() then
    raise exception 'appointment has already occurred' using errcode = '22023';
  end if;

  update public.appointments
  set status = 'confirmed'
  where id = p_appointment_id
  returning * into v_appointment;

  return v_appointment;
end;
$function$;
