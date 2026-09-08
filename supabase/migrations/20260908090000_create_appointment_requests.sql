-- Odentia Core — Solicitud de Cita (patient-initiated appointment request)
--
-- CLAUDE.md's Appointment Lifecycle defines TWO state machines that must
-- never be conflated:
--
--   Solicitud de Cita : Pendiente -> Aceptada / Rechazada   (this table)
--   Cita              : Programada -> Confirmada -> ... -> Completada
--                                                          (public.appointments)
--
-- The appointments migration (20260831090000) already said this out loud:
-- "`Solicitud de Cita` (patient-initiated request, Pendiente/Aceptada/
-- Rechazada) is a separate, not-yet-built state machine (Patient Portal
-- conversion, out of scope here)". This migration is that state machine —
-- a SEPARATE entity, never a status value on appointments: creating a
-- request creates NO Cita, reserves NO slot, and never touches Agenda.
-- Only the clinic ACCEPTING one creates a real `appointments` row (status
-- 'scheduled' = CLAUDE.md's "Programada"), linked back through
-- accepted_appointment_id.
--
-- Deliberately NOT modeled here, because the approved Portal booking UI
-- (see my-appointments-screen.tsx's NewAppointmentScheduler, ported to
-- real data in this same change) does not collect them, and inventing a
-- column no surface ever writes is exactly the "don't build for
-- hypothetical requirements" rule from CLAUDE.md:
--   - reason/treatment: the patient picks professional + preferred slot,
--     nothing else. The clinic chooses the Cita's Tratamiento when it
--     accepts (public.appointments.reason, already real).
--   - notes/message from the patient, and a rejection reason: neither
--     exists anywhere in the approved design.
--   - resolved_by/resolved_at: `updated_at` already records when the
--     status flipped; nothing in the approved design shows who resolved
--     it.
create type public.appointment_request_status as enum (
  'pending',
  'accepted',
  'rejected'
);

-- accepted_appointment_id below targets appointments (id, clinic_id) — the
-- same structural tenant-consistency pattern every child table in this
-- schema already uses (patients_id_clinic_id_key,
-- professional_profiles_id_clinic_id_key). That composite key already
-- exists: appointments_id_clinic_id_key was added by
-- 20260901090000_link_patient_clinical_encounters_to_appointments.sql for
-- exactly the same reason, so nothing new is needed here.
create table public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null,
  -- NOT NULL on purpose: the approved Portal picker always has a
  -- professional selected (it opens pre-selected on one and offers no
  -- "sin preferencia" option), so a nullable column would be a state no
  -- real surface can produce. It also keeps the staff-side RLS below a
  -- direct reuse of can_access_appointment() rather than a CASE over null.
  professional_profile_id uuid not null,
  -- The patient's PREFERENCE, never a reservation — no overlap/availability
  -- constraint applies to this column, by design (see the table comment).
  -- The clinic may accept a different instant entirely (see
  -- accept_appointment_request's p_starts_at).
  preferred_starts_at timestamptz not null,
  status public.appointment_request_status not null default 'pending',
  accepted_appointment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_requests_patient_clinic_fk
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade,
  constraint appointment_requests_professional_profile_clinic_fk
    foreign key (professional_profile_id, clinic_id)
    references public.professional_profiles (id, clinic_id)
    on delete cascade,
  -- cascade, matching this table's two sibling FKs — NOT `set null`, which
  -- would violate the check below, and not `restrict`, which would make
  -- deleting a patient fail outright (patients cascades into appointments
  -- AND into this table; a restrict here would fight that). Academic
  -- either way: appointments has no physical delete path at all
  -- (cancellation is status = 'cancelled', same convention as every other
  -- table here).
  constraint appointment_requests_accepted_appointment_clinic_fk
    foreign key (accepted_appointment_id, clinic_id)
    references public.appointments (id, clinic_id)
    on delete cascade,
  -- The link and the status can never disagree: an accepted request ALWAYS
  -- points at the Cita it produced, and a pending/rejected one never points
  -- at any Cita. Structural, not app-logic — accept_appointment_request
  -- below writes both in the same statement.
  constraint appointment_requests_accepted_link_check
    check ((status = 'accepted') = (accepted_appointment_id is not null))
);

create trigger set_updated_at
  before update on public.appointment_requests
  for each row execute function public.set_updated_at();

create index appointment_requests_clinic_id_status_idx
  on public.appointment_requests (clinic_id, status);
create index appointment_requests_patient_id_idx
  on public.appointment_requests (patient_id);
create index appointment_requests_professional_profile_id_idx
  on public.appointment_requests (professional_profile_id);

-- At most ONE open request per patient at a time. This is the real,
-- concurrency-safe guard behind the Portal's "evita doble submit" rule:
-- two racing submissions (double-click, two tabs) can both pass
-- request_my_appointment's own pre-check, but only one can land. It also
-- keeps the Portal's own "Solicitud pendiente" state unambiguous — the
-- same shape the approved design already used for a pending reschedule
-- request ("Solicitud pendiente", one at a time).
create unique index appointment_requests_one_pending_per_patient
  on public.appointment_requests (patient_id)
  where status = 'pending';

alter table public.appointment_requests enable row level security;

-- ============================================================
-- RLS — read only, for both audiences. Every write goes through a
-- SECURITY DEFINER RPC below: there is no INSERT/UPDATE/DELETE policy at
-- all, for anyone. (Same "narrow sanctioned write path" convention as
-- confirm_my_appointment / accept_patient_access_invitation.)
-- ============================================================

-- Patient: her OWN requests, resolved through the same real
-- patient_user_links path patients_select_own_via_link/
-- appointments_select_own_via_patient_link already use — never a
-- client-supplied patient_id/clinic_id. Matching patient_id alone already
-- guarantees clinic isolation, because appointment_requests_patient_clinic_fk
-- is a COMPOSITE FK: a request's clinic_id can never disagree with its
-- patient's own.
create policy appointment_requests_select_own_via_patient_link
  on public.appointment_requests for select
  to authenticated
  using (
    exists (
      select 1
      from public.patient_user_links l
      where l.patient_id = appointment_requests.patient_id
        and l.profile_id = auth.uid()
    )
  );

-- Staff: exactly the same scope rule that already governs the Cita this
-- request would become — can_access_appointment() (see the appointments
-- migration): clinic_admin/assistant across the whole clinic, a dentist
-- only for their OWN professional_profile. Reused verbatim rather than
-- restated, so the two can never drift: a dentist who could not see the
-- resulting Cita must not see the request for it either. No role is
-- widened here beyond what Agenda already grants.
create policy appointment_requests_select_staff
  on public.appointment_requests for select
  to authenticated
  using (public.can_access_appointment(clinic_id, professional_profile_id));

grant select on public.appointment_requests to authenticated;
-- No insert/update/delete grant, deliberately: the RPCs below are
-- SECURITY DEFINER and run as the function owner, so they never need the
-- caller to hold table privileges — and nothing else can write this table.

-- ============================================================
-- Helper: which patient record is the CALLER?
-- ============================================================
-- confirm_my_appointment (20260907220000/20260907230000) inlines this exact
-- resolution; it stays untouched (it is live and working) — this is the
-- extracted version every new Portal write path uses instead of a third
-- copy. Same two rules as resolve-patient-context.ts: no link at all is an
-- error, and MORE than one link is rejected outright rather than silently
-- resolved to an arbitrary patient (the same real person can legitimately
-- be a patient at more than one clinic).
create function public.my_linked_patient_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link_count integer;
  v_patient_id uuid;
begin
  select count(*) into v_link_count
  from public.patient_user_links l
  where l.profile_id = auth.uid();

  if v_link_count is null or v_link_count = 0 then
    raise exception 'no linked patient for this account' using errcode = '42501';
  end if;
  if v_link_count > 1 then
    raise exception 'ambiguous patient link for this account' using errcode = '42501';
  end if;

  select l.patient_id into v_patient_id
  from public.patient_user_links l
  where l.profile_id = auth.uid()
  limit 1;

  return v_patient_id;
end;
$$;

revoke execute on function public.my_linked_patient_id() from public;
grant execute on function public.my_linked_patient_id() to authenticated;

-- ============================================================
-- Helper: is this professional_profile bookable in this clinic right now?
-- ============================================================
-- Mirrors fetchClinicalProfessionals (appointments-data.ts) and
-- is_active_clinical_professional's own shape exactly: an ACTIVE
-- professional_profile whose membership is ACTIVE and clinical
-- (clinic_admin or dentist — an assistant never holds a professional
-- profile). Used by BOTH the patient's request and the clinic's
-- acceptance, so neither can name a professional the Agenda itself would
-- not offer as a column.
create function public.is_bookable_professional(target_clinic_id uuid, target_professional_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.professional_profiles pp
    join public.clinic_memberships m on m.id = pp.clinic_membership_id
    where pp.id = target_professional_profile_id
      and pp.clinic_id = target_clinic_id
      and pp.active
      and m.status = 'active'
      and m.role in ('clinic_admin', 'dentist')
  );
$$;

revoke execute on function public.is_bookable_professional(uuid, uuid) from public;
grant execute on function public.is_bookable_professional(uuid, uuid) to authenticated;

-- ============================================================
-- Patient: the clinic's bookable professionals (for the Portal picker)
-- ============================================================
-- Same reasoning as get_my_appointment_professionals (20260907210000):
-- professional_profiles / clinic_memberships / profiles are ALL staff-only
-- for SELECT, and widening their audience with new patient-readable RLS is
-- exactly what that migration decided against. This is the same narrow
-- SECURITY DEFINER shape, scoped to the CALLING patient's own clinic
-- (resolved through patient_user_links -> patients.clinic_id, never a
-- client-supplied clinic_id), returning only the display fields the
-- approved picker shows.
create function public.get_my_clinic_professionals()
returns table (
  professional_profile_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  license_number text,
  specialty_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pp.id,
    prof.first_name,
    prof.last_name,
    prof.avatar_url,
    pp.license_number,
    s.name
  from public.professional_profiles pp
  join public.clinic_memberships m on m.id = pp.clinic_membership_id
  join public.profiles prof on prof.id = m.profile_id
  left join public.specialties s on s.id = pp.primary_specialty_id
  where pp.active
    and m.status = 'active'
    and m.role in ('clinic_admin', 'dentist')
    and exists (
      select 1
      from public.patient_user_links l
      join public.patients pt on pt.id = l.patient_id
      where l.profile_id = auth.uid()
        and pt.clinic_id = pp.clinic_id
    )
  order by prof.first_name, prof.last_name;
$$;

revoke execute on function public.get_my_clinic_professionals() from public;
grant execute on function public.get_my_clinic_professionals() to authenticated;

-- ============================================================
-- Patient: create a request (NEVER a Cita)
-- ============================================================
-- Accepts ONLY what the patient may legitimately choose — a professional
-- and a preferred instant. patient_id and clinic_id are resolved
-- server-side from auth.uid(), never accepted from the client.
--
-- This function deliberately does NOT touch public.appointments in any
-- way: no insert, no slot reservation, no overlap check, no availability
-- check. Those are all the CLINIC's decision at acceptance time (see
-- accept_appointment_request), and running them here would either reserve
-- time the clinic never agreed to or reject a preference that is perfectly
-- reasonable to express.
create function public.request_my_appointment(
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

  -- Pre-check for a clear message; appointment_requests_one_pending_per_patient
  -- is the actual guarantee under concurrency (same "pre-check for UX,
  -- constraint for the real guarantee" split as every other racy write in
  -- this schema).
  if exists (
    select 1 from public.appointment_requests r
    where r.patient_id = v_patient_id
      and r.status = 'pending'
  ) then
    raise exception 'a pending request already exists' using errcode = '22023';
  end if;

  insert into public.appointment_requests (clinic_id, patient_id, professional_profile_id, preferred_starts_at)
  values (v_clinic_id, v_patient_id, p_professional_profile_id, p_preferred_starts_at)
  returning * into v_request;

  return v_request;
end;
$$;

revoke execute on function public.request_my_appointment(uuid, timestamptz) from public;
grant execute on function public.request_my_appointment(uuid, timestamptz) to authenticated;

-- ============================================================
-- Staff: accept a request -> create exactly one real Cita, atomically
-- ============================================================
-- The whole function body is ONE transaction: if creating the Cita fails
-- for ANY reason — a past date, an unavailable professional, an overlap
-- (appointments_no_overlap, the GiST EXCLUDE constraint), a schedule/
-- absence conflict (validate_appointment_availability) — the exception
-- propagates and Postgres rolls the entire call back. The request is left
-- exactly as it was: still `pending`, with no Cita and no
-- accepted_appointment_id. There is no path where a request flips to
-- accepted without its Cita, or a Cita exists without its request being
-- accepted.
--
-- Concurrency: `select ... for update` locks the request row first, so two
-- staff members accepting the same request at the same time serialize —
-- the second call re-reads it only after the first commits, sees status
-- 'accepted' (no longer 'pending'), and is rejected. Exactly one Cita is
-- ever created per request, never two.
--
-- Every real Agenda rule that protects public.appointments applies here
-- unchanged, because this INSERTs into that same table and its triggers/
-- constraints are not RLS and are never bypassed by SECURITY DEFINER:
--   - appointments_no_overlap (EXCLUDE, 23P01)
--   - validate_appointment_availability (horario + ausencias, 23514)
--   - the composite tenant FKs
-- Nothing is re-implemented here; only the checks those cannot express
-- (past date, bookable professional, catalog membership of room/reason)
-- are done explicitly below.
--
-- Authorization: BOTH sides are checked with can_access_appointment() —
-- the request as it stands (so a dentist cannot act on another dentist's
-- request) AND the professional the Cita would be assigned to (so a
-- dentist cannot reassign it onto a colleague's agenda). clinic_admin and
-- assistant already have full-clinic scope through that same helper. No
-- new role is granted anything Agenda didn't already grant it.
--
-- The clinic's adjustments (p_starts_at, p_professional_profile_id,
-- p_duration_minutes, p_room, p_reason, p_notes) are the CLINIC's
-- decision, not the patient's preference: preferred_starts_at is left
-- untouched on the request, so what the patient asked for stays visible
-- next to what the clinic actually scheduled.
create function public.accept_appointment_request(
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

  -- room/reason are free-text SNAPSHOTS on appointments (see that
  -- migration's own comments), but they must still come from this clinic's
  -- own real, active catalogs — never arbitrary client text.
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

  -- Same prefill convention as createAppointment (appointments-actions.ts):
  -- contact_phone starts as the patient's own number, independently
  -- editable afterwards from the Cita's detail modal.
  select p.phone into v_patient_phone
  from public.patients p
  where p.id = v_request.patient_id;

  -- 'scheduled' = CLAUDE.md's "Programada": accepting a Solicitud produces
  -- a Cita at the START of the Cita lifecycle, NOT a confirmed one — the
  -- patient still confirms her own attendance afterwards
  -- (confirm_my_appointment: scheduled -> confirmed). This deliberately
  -- differs from the clinic's own "Nueva cita" flow, which creates a Cita
  -- already 'confirmed' because the front desk arranged it directly.
  insert into public.appointments (
    clinic_id, patient_id, professional_profile_id, starts_at, duration_minutes,
    reason, room, contact_phone, notes, status
  )
  values (
    v_request.clinic_id, v_request.patient_id, p_professional_profile_id, p_starts_at, p_duration_minutes,
    v_reason, v_room, v_patient_phone, v_notes, 'scheduled'
  )
  returning * into v_appointment;

  update public.appointment_requests
  set status = 'accepted',
      accepted_appointment_id = v_appointment.id
  where id = v_request.id;

  return v_appointment;
end;
$$;

revoke execute on function public.accept_appointment_request(uuid, uuid, timestamptz, integer, text, text, text) from public;
grant execute on function public.accept_appointment_request(uuid, uuid, timestamptz, integer, text, text, text) to authenticated;

-- ============================================================
-- Staff: reject a request -> no Cita is ever created
-- ============================================================
create function public.reject_appointment_request(p_request_id uuid)
returns public.appointment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.appointment_requests;
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

  -- Neither an accepted nor an already-rejected request can be rejected —
  -- the same "no double resolution" rule acceptance enforces, and the
  -- reason the row is locked FOR UPDATE first.
  if v_request.status <> 'pending' then
    raise exception 'request is no longer pending' using errcode = '22023';
  end if;

  update public.appointment_requests
  set status = 'rejected'
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

revoke execute on function public.reject_appointment_request(uuid) from public;
grant execute on function public.reject_appointment_request(uuid) to authenticated;
