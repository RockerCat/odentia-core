-- Odentia Core — Agenda real: "Paciente llegó" + "Sala de espera"
--
-- appointments_update_scoped (see 20260831090000_create_appointments.sql)
-- only scopes WHO may write a row (clinic_admin/assistant: any professional
-- in the clinic; dentist: only their own) — it says nothing about WHICH
-- status VALUES a caller may write, so appointments-actions.ts's
-- updateAppointment() (a plain client-side `.update()`, not a SECURITY
-- DEFINER RPC) could already set `status` to any of the 8 enum values,
-- from any prior status, for anyone who can write the row at all. That gap
-- was harmless while patient_arrived/waiting_room had no UI action
-- pointing at them (see that migration's own comment: "stay unused by any
-- RLS/UI path until a future iteration gives the front desk a real
-- two-step 'llegó' → 'en sala de espera' flow"). This is that iteration —
-- now that real buttons write these two values, "the security shouldn't
-- depend only on hiding buttons" (CLAUDE.md's own security principle)
-- means the two-step order AND the front-desk-only role restriction both
-- need enforcing here, not just in the UI's own showMarkArrived/
-- showSendToWaitingRoom gates (real-appointment-detail-modal.tsx).
--
-- Deliberately narrow: this trigger ONLY ever fires extra checks when the
-- NEW status is patient_arrived or waiting_room. Every other transition
-- (confirm/cancel/reactivate/no_show/in_progress/completed, and the status
-- dropdown's own CHANGEABLE_STATUSES) is completely untouched — no new
-- validation, same as before this migration. Reusing has_clinic_role (the
-- same helper can_access_appointment already reuses) rather than inventing
-- a new role check.
create function public.validate_appointment_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'patient_arrived' then
      if old.status not in ('scheduled', 'confirmed') then
        raise exception 'cannot mark patient arrived from status %', old.status using errcode = '22023';
      end if;
      if not public.has_clinic_role(new.clinic_id, array['clinic_admin', 'assistant']::public.membership_role[]) then
        raise exception 'not authorized to mark patient arrived' using errcode = '42501';
      end if;
    elsif new.status = 'waiting_room' then
      if old.status is distinct from 'patient_arrived' then
        raise exception 'cannot send to waiting room from status %', old.status using errcode = '22023';
      end if;
      if not public.has_clinic_role(new.clinic_id, array['clinic_admin', 'assistant']::public.membership_role[]) then
        raise exception 'not authorized to send patient to waiting room' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_appointment_status_transition
  before update on public.appointments
  for each row execute function public.validate_appointment_status_transition();
