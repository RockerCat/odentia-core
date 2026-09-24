-- Odentia Core — a `completed` Cita can never be cancelled, by any role.
--
-- Pilot E2E: a Cita already "Completada" still offered "Cancelar cita"
-- (every role; seen as Assistant). CLAUDE.md's Appointment Lifecycle:
-- "Cancelada" always happens BEFORE the encounter, and "Completada" only
-- happens once "Finalizar atención" persisted a finalized atención — so
-- completed → cancelled is never a valid transition. The UI now hides the
-- button (canCancelAppointment, real-status.ts); this is the real guard,
-- since appointments_update_scoped lets staff UPDATE status directly.
--
-- create or replace of the existing BEFORE UPDATE trigger function
-- (20260907120000, its only definition), byte-for-byte except for the one
-- new branch below. Every other transition — including the arrival rules
-- already here — is unchanged; no data is touched.

create or replace function public.validate_appointment_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'cancelled' and old.status = 'completed' then
      raise exception 'cannot cancel a completed appointment' using errcode = '22023';
    elsif new.status = 'patient_arrived' then
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
