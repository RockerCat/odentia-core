-- Odentia Core — reactivating a cancelled Cita only returns it to an active,
-- manageable state.
--
-- Pilot E2E: staff reactivated a patient-cancelled future Cita and it ended
-- up "Paciente llegó". The reactivation itself already wrote `confirmed`
-- (reactivateAppointment) and cancelled → patient_arrived was already
-- impossible here; the arrival came from a second click on the modal's
-- primary button, which turned into "Paciente llegó" the instant the
-- reactivation succeeded (fixed in the UI: the modal now closes on
-- success). This is the DB-level guard for the rule itself: from
-- `cancelled`, a Cita may only go to `scheduled` or `confirmed` — never
-- straight into in_progress/completed/no_show (e.g. via the status editor).
--
-- create or replace of the trigger function exactly as applied by
-- 20260924120000, plus that one check. Every other transition, the
-- completed → cancelled guard and the motivo clearing are unchanged. No
-- data touched.

create or replace function public.validate_appointment_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    -- Reactivating a cancelled Cita returns it to a normal, manageable
    -- state only — never straight into the arrival/clinical flow.
    if old.status = 'cancelled' and new.status not in ('scheduled', 'confirmed') then
      raise exception 'cancelled appointment can only be reactivated as scheduled or confirmed (not %)', new.status using errcode = '22023';
    end if;

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

    if old.status = 'cancelled' and new.status <> 'cancelled' then
      new.cancellation_reason_code := null;
      new.cancellation_reason_detail := null;
      new.cancelled_by := null;
    end if;
  end if;
  return new;
end;
$$;
