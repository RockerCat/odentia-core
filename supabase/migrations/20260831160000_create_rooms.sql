-- Odentia Core — Consultorios: catálogo real por clínica
--
-- Same pattern as the treatments migration (20260831150000_create_treatments.sql):
-- replaces the hardcoded ROOMS array (dashboard/mock-data.ts) backing "Nueva
-- cita"'s Consultorio picker with a real, tenant-scoped table. Operational
-- config, not a clinical record in itself (a `Cita` already stores its own
-- `room` as a free-text snapshot at creation time, not a FK to this table —
-- see the appointments migration's own comment on `room`; deliberately kept
-- that way here too, see this task's own scope note on not widening it into
-- an FK yet) — so this follows the clinic_memberships/professional_profiles
-- convention (cascade on clinic delete) rather than patients/appointments'
-- restrict convention. No physical DELETE anywhere here: `active = false`
-- is the only lifecycle, same convention as treatments/patients/
-- professional_profiles — deactivating (or renaming) a room can never
-- retroactively break an appointment that already recorded its name.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_clinic_id_name_key unique (clinic_id, name)
);

create trigger set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

create index rooms_clinic_id_idx on public.rooms (clinic_id);
create index rooms_clinic_id_active_idx on public.rooms (clinic_id, active);

alter table public.rooms enable row level security;

-- SELECT: any active member of the clinic — clinic_admin, dentist, and
-- assistant all create appointments (see can_access_appointment in the
-- appointments migration) and therefore all need to read the active
-- catalog for the Consultorio picker; this isn't scoped per-professional
-- the way appointments/patients are, so is_clinic_member() (not
-- has_clinic_role()) is the right check. Same reasoning as
-- treatments_select_member.
create policy rooms_select_member
  on public.rooms for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

-- INSERT/UPDATE: clinic_admin only — managing the room catalog is
-- clinic-wide configuration (see CLAUDE.md Domain Model: Dentist "does not
-- manage... clinic-wide configuration"; Assistant "does not manage...
-- administrative configuration"). No DELETE policy: active=false is the
-- only lifecycle, enforced here, not just by the app not offering a delete
-- button.
create policy rooms_insert_admin
  on public.rooms for insert
  to authenticated
  with check (public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[]));

create policy rooms_update_admin
  on public.rooms for update
  to authenticated
  using (public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[]))
  with check (public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[]));

grant select, insert, update on public.rooms to authenticated;

-- Seed: ROOMS (dashboard/mock-data.ts) was the fixed catalog every real
-- clinic effectively used before this table existed. Seed it once per
-- EXISTING clinic as their starting catalog, so today's Nueva cita
-- Consultorio picker doesn't go from 3 options to 0 the moment this ships
-- — clinics created after this migration start with an empty catalog
-- instead (bootstrap_clinic is deliberately not touched here, same
-- decision already made for treatments; a new clinic's admin builds her
-- own catalog from /clinica → Consultorios). ON CONFLICT DO NOTHING relies
-- on rooms_clinic_id_name_key, so this block is safe to run more than once
-- and never produces duplicates.
insert into public.rooms (clinic_id, name)
select c.id, r.name
from public.clinics c
cross join (
  values
    ('Consultorio 1'),
    ('Consultorio 2'),
    ('Consultorio 3')
) as r (name)
on conflict (clinic_id, name) do nothing;
