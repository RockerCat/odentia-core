-- Odentia Core — Agenda real: citas (appointments)
--
-- V1 model for a real, tenant-scoped `Cita` (see CLAUDE.md's Appointment
-- Lifecycle). This migration ONLY covers the already-scheduled `Cita`
-- lifecycle — `Solicitud de Cita` (patient-initiated request,
-- Pendiente/Aceptada/Rechazada) is a separate, not-yet-built state machine
-- (Patient Portal conversion, out of scope here); every appointment created
-- by this feature is clinic-staff-created and starts life already
-- `confirmed`, matching the approved Agenda demo's own "Nueva cita" flow
-- (which always creates a confirmed appointment — there is no
-- clinic-side "pending request" concept in the demo, only a `pending`
-- status value reachable by hand from the status dropdown, kept below as
-- `scheduled`).
--
-- Status vocabulary is the full 8-value real lifecycle from CLAUDE.md
-- (scheduled → confirmed → patient_arrived → waiting_room → in_progress →
-- completed / no_show / cancelled), NOT the mock's flattened 6-value
-- AppointmentStatus. Two of these values (patient_arrived, waiting_room)
-- have no UI action wired to them yet in this iteration — see
-- `patient_arrived_at` below and PROJECT_STATUS.md's pending-items note for
-- why: the approved demo only exposes a single "Paciente llegó" toggle
-- (an operational flag INDEPENDENT of status, never conflated with it —
-- see CLAUDE.md's own note on AppointmentStatus overloading), modeled here
-- as an additive nullable timestamp rather than by driving `status`
-- through patient_arrived/waiting_room. Those two enum values are declared
-- now (correct future vocabulary) but stay unused by any RLS/UI path until
-- a future iteration gives the front desk a real two-step "llegó" → "en
-- sala de espera" flow. Likewise `no_show`: the approved demo has no
-- "Marcar no asistió" action anywhere — declared for correctness, not yet
-- reachable from any UI in this iteration.
create type public.appointment_status as enum (
  'scheduled',
  'confirmed',
  'patient_arrived',
  'waiting_room',
  'in_progress',
  'completed',
  'no_show',
  'cancelled'
);

-- professional_profiles has no (id, clinic_id) composite unique constraint
-- yet (only (clinic_membership_id) unique) — added here so appointments can
-- use the same structural tenant-consistency pattern as every other child
-- table in this schema (patients_id_clinic_id_key,
-- clinic_memberships_id_clinic_id_key): a composite FK makes
-- (professional_profile_id, clinic_id) drifting apart structurally
-- impossible, not just a convention.
alter table public.professional_profiles
  add constraint professional_profiles_id_clinic_id_key unique (id, clinic_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null,
  professional_profile_id uuid not null,
  starts_at timestamptz not null,
  duration_minutes integer not null default 30,
  -- "Tratamiento" in the approved demo — a planned treatment/reason, from a
  -- small fixed catalog (TREATMENT_OPTIONS) client-side, same convention as
  -- ROOMS below. Nullable: the demo allows creating an appointment with no
  -- treatment chosen yet.
  reason text,
  -- "Consultorio" — a small fixed catalog (ROOMS), not a real table (see
  -- PROJECT_STATUS.md: Consultorios has no real table yet). Same pattern as
  -- `reason`/TREATMENT_OPTIONS: a real value the clinic picked from a fixed
  -- list, stored for real, not mock data.
  room text,
  -- "Teléfono" in the appointment detail modal — an editable, per-appointment
  -- contact number (front desk may record a different callback number than
  -- the patient's own master record), prefilled from patients.phone at
  -- creation but independently editable thereafter.
  contact_phone text,
  -- "Observaciones".
  notes text,
  status public.appointment_status not null default 'confirmed',
  -- Additive "Paciente llegó" marker — see the enum comment above for why
  -- this is a separate column instead of a `status` value.
  patient_arrived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_duration_minutes_positive check (duration_minutes > 0),
  constraint appointments_patient_clinic_fk
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade,
  constraint appointments_professional_profile_clinic_fk
    foreign key (professional_profile_id, clinic_id)
    references public.professional_profiles (id, clinic_id)
    on delete cascade
);
-- clinic_id restrict: matches patients' own convention (clinical/
-- operational weight — a clinic must never be deletable in a way that
-- silently wipes its appointment history). patient_id/professional_profile_id
-- cascade via the composite FKs: an appointment has no purpose once its
-- patient or professional record is gone (neither has a real delete path
-- today either — active = false is the convention on both).

create trigger set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create index appointments_clinic_id_idx on public.appointments (clinic_id);
create index appointments_clinic_id_starts_at_idx on public.appointments (clinic_id, starts_at);
create index appointments_professional_profile_id_starts_at_idx on public.appointments (professional_profile_id, starts_at);
create index appointments_patient_id_idx on public.appointments (patient_id);

alter table public.appointments enable row level security;

-- Reusable "may this caller see/write this appointment" check —
-- clinic_admin/assistant get full-clinic scope (matches CLAUDE.md: admin
-- has full clinical permissions including "Full schedule"; assistant
-- "manages appointments" across every dentist in the clinic, per the
-- Domain Model's Assistant section). A dentist is scoped to only their OWN
-- professional_profile (CLAUDE.md: "Manages only their own clinical
-- operation... Their own schedule") — never another dentist's column, at
-- the RLS layer, not just client-side filtering (see CLAUDE.md Security:
-- "never expose... private data").
create function public.can_access_appointment(target_clinic_id uuid, target_professional_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_clinic_role(target_clinic_id, array['clinic_admin', 'assistant']::public.membership_role[])
    or exists (
      select 1
      from public.professional_profiles pp
      join public.clinic_memberships m on m.id = pp.clinic_membership_id
      where pp.id = target_professional_profile_id
        and m.profile_id = auth.uid()
        and m.status = 'active'
        and m.role = 'dentist'
    );
$$;

revoke execute on function public.can_access_appointment(uuid, uuid) from public;
grant execute on function public.can_access_appointment(uuid, uuid) to authenticated;

create policy appointments_select_scoped
  on public.appointments for select
  to authenticated
  using (public.can_access_appointment(clinic_id, professional_profile_id));

create policy appointments_insert_scoped
  on public.appointments for insert
  to authenticated
  with check (public.can_access_appointment(clinic_id, professional_profile_id));

create policy appointments_update_scoped
  on public.appointments for update
  to authenticated
  using (public.can_access_appointment(clinic_id, professional_profile_id))
  with check (public.can_access_appointment(clinic_id, professional_profile_id));
-- WITH CHECK re-runs the same scoped check against the NEW row — a dentist
-- editing their own appointment cannot reassign it to another dentist's
-- professional_profile_id unless they're clinic_admin/assistant. No DELETE
-- policy: cancellation is `status = 'cancelled'`, never a row delete, same
-- convention as every other table in this schema.

grant select, insert, update on public.appointments to authenticated;
