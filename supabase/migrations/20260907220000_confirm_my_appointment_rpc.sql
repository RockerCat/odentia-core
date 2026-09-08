-- Odentia Core — Patient Portal: "Confirmar asistencia" real
--
-- The Patient's own attendance confirmation (CLAUDE.md's Appointment
-- Lifecycle: "Confirmada means the Patient confirmed their own attendance
-- ... before it happens") — the only transition a Patient may ever trigger
-- on her own Cita: scheduled -> confirmed. `scheduled` is the real enum
-- value for what CLAUDE.md's lifecycle calls "Programada" (confirmed via
-- CHANGEABLE_STATUSES in real-status.ts, Agenda's own status-editor
-- options, and REAL_STATUS_LABELS).
--
-- No general UPDATE grant to the Patient (appointments_update_scoped stays
-- staff-only, untouched) — this is the one narrow, SECURITY DEFINER write
-- path, same pattern as create_my_professional_profile/
-- accept_patient_access_invitation/confirm_my_appointment's sibling RPCs.
-- Never accepts patient_id/clinic_id: both are resolved from auth.uid() via
-- patient_user_links, exactly like resolve-patient-context.ts's own
-- resolution — an appointment_id for another patient's Cita, or for a Cita
-- in another clinic, simply won't match `a.patient_id = v_patient_id` and
-- is rejected as "not found or not yours".
--
-- `select ... for update` locks the row for the statement's transaction, so
-- two concurrent confirmations serialize: the second call re-reads the row
-- only after the first commits, finds status already 'confirmed' (no
-- longer 'scheduled'), and raises a controlled error rather than silently
-- re-confirming or corrupting data — atomic, safe under double-submit.
--
-- Existing triggers (validate_appointment_status_transition,
-- validate_appointment_availability, set_updated_at) still run on this
-- UPDATE exactly as they do for any staff-issued one — this never
-- introduces a second confirmation mechanism. validate_appointment_status_
-- transition has no branch for 'confirmed' (only patient_arrived/
-- waiting_room are gated there), and validate_appointment_availability's
-- own early-return covers an update that only changes `status` (starts_at/
-- duration_minutes/professional_profile_id unchanged, old status not
-- terminal) — so neither blocks this transition.
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
  select count(*), min(l.patient_id)
    into v_link_count, v_patient_id
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

grant execute on function public.confirm_my_appointment(uuid) to authenticated;
