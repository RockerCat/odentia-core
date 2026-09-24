-- Odentia Core — Patient Portal: "Reprogramar" (a request) and "Cancelar cita".
--
-- REPROGRAMAR is a Solicitud, never a direct change: it reuses
-- public.appointment_requests (same lifecycle Pendiente → Aceptada/Rechazada,
-- same staff inbox, same acceptance/rejection RPCs) with an explicit kind
-- ('new' | 'reschedule') and a link to the Cita being rescheduled. The Cita
-- only moves when the clinic ACCEPTS the request — atomically, by updating
-- that same appointments row (same id/history), so the existing
-- validate_appointment_availability trigger and the appointments overlap
-- EXCLUDE constraint re-check the slot at that moment. It never inserts a
-- second Cita. Rejecting leaves the Cita untouched.
--
-- CANCELAR is a real, patient-initiated cancellation of her OWN future,
-- still-scheduled/confirmed Cita (cancel_my_appointment), recording the
-- motivo (the approved modal's options) and that the patient cancelled it.
-- Completed/arrived/waiting/in-progress Citas are never cancellable here
-- (the completed → cancelled DB guard from 20260924110000 stays as is).
--
-- Nothing here rewrites existing data: every existing request becomes
-- kind 'new' (its true meaning), new columns start NULL.

-- ============================================================
-- 1. appointment_requests: kind + link to the Cita being rescheduled
-- ============================================================
create type public.appointment_request_kind as enum ('new', 'reschedule');

alter table public.appointment_requests
  add column kind public.appointment_request_kind not null default 'new',
  add column appointment_id uuid,
  add constraint appointment_requests_appointment_clinic_fk
    foreign key (appointment_id, clinic_id)
    references public.appointments (id, clinic_id)
    on delete cascade,
  add constraint appointment_requests_reschedule_link_check
    check ((kind = 'reschedule') = (appointment_id is not null));

create index appointment_requests_appointment_id_idx
  on public.appointment_requests (appointment_id);

-- "At most one pending request per patient" stays true for NEW requests;
-- a reschedule is scoped to its own Cita instead (one pending per Cita),
-- so a patient can ask to move an existing Cita while a separate new
-- request is pending, but never file two competing reschedules.
drop index public.appointment_requests_one_pending_per_patient;

create unique index appointment_requests_one_pending_per_patient
  on public.appointment_requests (patient_id)
  where status = 'pending' and kind = 'new';

create unique index appointment_requests_one_pending_reschedule_per_appointment
  on public.appointment_requests (appointment_id)
  where status = 'pending' and kind = 'reschedule';

-- ============================================================
-- 2. request_my_appointment — unchanged except its duplicate check now
--    only counts NEW requests (mirrors the split index above).
-- ============================================================
create or replace function public.request_my_appointment(
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
  v_clinic_id uuid;
  v_request public.appointment_requests;
begin
  v_patient_id := public.my_linked_patient_id();

  select p.clinic_id into v_clinic_id
  from public.patients p
  where p.id = v_patient_id;

  if v_clinic_id is null then
    raise exception 'no linked patient for this account' using errcode = '42501';
  end if;

  if p_preferred_starts_at is null or p_preferred_starts_at <= now() then
    raise exception 'preferred date is in the past' using errcode = '22023';
  end if;

  if not public.is_bookable_professional(v_clinic_id, p_professional_profile_id) then
    raise exception 'professional is not available in this clinic' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.appointment_requests r
    where r.patient_id = v_patient_id
      and r.status = 'pending'
      and r.kind = 'new'
  ) then
    raise exception 'a pending request already exists' using errcode = '22023';
  end if;

  insert into public.appointment_requests (clinic_id, patient_id, professional_profile_id, preferred_starts_at)
  values (v_clinic_id, v_patient_id, p_professional_profile_id, p_preferred_starts_at)
  returning * into v_request;

  return v_request;
end;
$$;

-- ============================================================
-- 3. request_my_appointment_reschedule — the Patient asks to move her OWN
--    Cita. Identity/clinic always from auth.uid() (my_linked_patient_id),
--    the Cita must be hers, still scheduled/confirmed and in the future.
--    Only a request is written; the Cita is never touched here. Like a new
--    request, the preferred slot is a preference: the clinic's acceptance
--    is where availability/overlap are enforced (atomically, section 4).
-- ============================================================
create function public.request_my_appointment_reschedule(
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

revoke execute on function public.request_my_appointment_reschedule(uuid, uuid, timestamptz) from public;
grant execute on function public.request_my_appointment_reschedule(uuid, uuid, timestamptz) to authenticated;

-- ============================================================
-- 4. accept_appointment_request — same signature/authorization; 'new'
--    requests behave exactly as before (insert a Cita). A 'reschedule'
--    request UPDATES its own linked Cita in place (same id), re-validated
--    by the existing availability trigger + overlap constraint inside this
--    same transaction; the request is marked accepted with
--    accepted_appointment_id = that same Cita. Never two Citas.
-- ============================================================
create or replace function public.accept_appointment_request(
  p_request_id uuid,
  p_professional_profile_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_room text,
  p_reason text,
  p_notes text
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.appointment_requests;
  v_appointment public.appointments;
  v_patient_phone text;
  v_room text := nullif(btrim(coalesce(p_room, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  select * into v_request
  from public.appointment_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'request not found' using errcode = '42501';
  end if;

  if not public.can_access_appointment(v_request.clinic_id, v_request.professional_profile_id) then
    raise exception 'not authorized for this request' using errcode = '42501';
  end if;

  if not public.can_access_appointment(v_request.clinic_id, p_professional_profile_id) then
    raise exception 'not authorized for this professional' using errcode = '42501';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'request is no longer pending' using errcode = '22023';
  end if;

  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'appointment duration must be positive' using errcode = '22023';
  end if;

  if not public.is_bookable_professional(v_request.clinic_id, p_professional_profile_id) then
    raise exception 'professional is not available in this clinic' using errcode = '22023';
  end if;

  if v_room is not null and not exists (
    select 1 from public.rooms rm
    where rm.clinic_id = v_request.clinic_id and rm.name = v_room and rm.active
  ) then
    raise exception 'room is not part of this clinic''s active catalog' using errcode = '22023';
  end if;

  if v_reason is not null and not exists (
    select 1 from public.treatments t
    where t.clinic_id = v_request.clinic_id and t.name = v_reason and t.active
  ) then
    raise exception 'treatment is not part of this clinic''s active catalog' using errcode = '22023';
  end if;

  if v_request.kind = 'reschedule' then
    select a.* into v_appointment
    from public.appointments a
    where a.id = v_request.appointment_id
      and a.clinic_id = v_request.clinic_id
      and a.patient_id = v_request.patient_id
    for update;

    if not found then
      raise exception 'appointment to reschedule not found' using errcode = '42501';
    end if;

    -- Staff must also be allowed to manage the Cita being moved, not just
    -- the requested/destination professional.
    if not public.can_access_appointment(v_appointment.clinic_id, v_appointment.professional_profile_id) then
      raise exception 'not authorized for this appointment' using errcode = '42501';
    end if;

    if v_appointment.status not in ('scheduled', 'confirmed') then
      raise exception 'appointment can no longer be rescheduled' using errcode = '22023';
    end if;

    update public.appointments
    set professional_profile_id = p_professional_profile_id,
        starts_at = p_starts_at,
        duration_minutes = p_duration_minutes,
        room = v_room,
        reason = v_reason,
        notes = v_notes
    where id = v_appointment.id
    returning * into v_appointment;
  else
    select p.phone into v_patient_phone
    from public.patients p
    where p.id = v_request.patient_id;

    insert into public.appointments (
      clinic_id, patient_id, professional_profile_id, starts_at, duration_minutes,
      reason, room, contact_phone, notes, status
    )
    values (
      v_request.clinic_id, v_request.patient_id, p_professional_profile_id, p_starts_at, p_duration_minutes,
      v_reason, v_room, v_patient_phone, v_notes, 'scheduled'
    )
    returning * into v_appointment;
  end if;

  update public.appointment_requests
  set status = 'accepted',
      accepted_appointment_id = v_appointment.id
  where id = v_request.id;

  return v_appointment;
end;
$$;

-- ============================================================
-- 5. Cancellation motivo on appointments (patient-initiated only)
-- ============================================================
alter table public.appointments
  add column cancellation_reason_code text,
  add column cancellation_reason_detail text,
  add column cancelled_by text,
  add constraint appointments_cancellation_reason_code_check
    check (cancellation_reason_code is null or cancellation_reason_code in ('cannot_attend', 'need_reschedule', 'personal', 'other')),
  add constraint appointments_cancelled_by_check
    check (cancelled_by is null or cancelled_by = 'patient'),
  add constraint appointments_cancellation_fields_only_when_cancelled_check
    check ((cancellation_reason_code is null and cancellation_reason_detail is null and cancelled_by is null) or status = 'cancelled'),
  add constraint appointments_cancellation_other_detail_check
    check (cancellation_reason_code is distinct from 'other' or nullif(btrim(coalesce(cancellation_reason_detail, '')), '') is not null);

-- Same trigger function as 20260924110000, byte-for-byte, plus one step:
-- when a cancelled Cita is reactivated (staff "Reactivar"), its previous
-- cancellation motivo no longer applies and is cleared.
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

    if old.status = 'cancelled' and new.status <> 'cancelled' then
      new.cancellation_reason_code := null;
      new.cancellation_reason_detail := null;
      new.cancelled_by := null;
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 6. cancel_my_appointment — the Patient cancels her OWN future,
--    still-scheduled/confirmed Cita. Any pending reschedule request for it
--    is closed in the same transaction (it can no longer apply).
-- ============================================================
create function public.cancel_my_appointment(
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

  if p_reason_code is null or p_reason_code not in ('cannot_attend', 'need_reschedule', 'personal', 'other') then
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

revoke execute on function public.cancel_my_appointment(uuid, text, text) from public;
grant execute on function public.cancel_my_appointment(uuid, text, text) to authenticated;

-- ============================================================
-- 7. get_my_professional_schedule — the REAL weekly schedule and absence
--    dates of one bookable professional of the calling Patient's own
--    clinic, so the Portal's picker offers real slots instead of a fixed
--    grid. Only that professional's own blocks/dates — no appointment,
--    patient or other clinic data. professional_availability/absences stay
--    staff-only for direct SELECT; this is the Patient's narrow read.
-- ============================================================
create function public.get_my_professional_schedule(p_professional_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
begin
  select p.clinic_id into v_clinic_id
  from public.patients p
  where p.id = public.my_linked_patient_id();

  if v_clinic_id is null or not public.is_bookable_professional(v_clinic_id, p_professional_profile_id) then
    raise exception 'professional is not available in this clinic' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day_of_week', pa.day_of_week,
        'start_time', pa.start_time,
        'end_time', pa.end_time,
        'active', pa.active
      ))
      from public.professional_availability pa
      where pa.professional_profile_id = p_professional_profile_id
        and pa.clinic_id = v_clinic_id
    ), '[]'::jsonb),
    'absences', coalesce((
      select jsonb_agg(jsonb_build_object('start_date', ab.start_date, 'end_date', ab.end_date))
      from public.professional_absences ab
      where ab.professional_profile_id = p_professional_profile_id
        and ab.clinic_id = v_clinic_id
        and ab.active
        and ab.end_date >= current_date
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_my_professional_schedule(uuid) from public;
grant execute on function public.get_my_professional_schedule(uuid) to authenticated;
