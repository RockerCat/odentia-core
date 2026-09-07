-- Odentia Core — Configuración real: Horario/Disponibilidad del profesional
--
-- Minimal recurring-weekly-availability model: one row per (professional,
-- day of week, time block). day_of_week follows ISO 8601 (1=Lunes..
-- 7=Domingo), matching DAY_ORDER's own Monday-first Spanish ordering
-- elsewhere in the app (appointments-card.tsx) — never the mock's own
-- letter-code days, this is a fresh real table. More than one row per
-- (professional, day) is allowed on purpose (see task scope: "permita más
-- de un bloque por día") — e.g. a lunch-split morning/afternoon schedule —
-- nothing here caps it at one.
--
-- Deliberately NOT modeled: exceptions/holidays (that's
-- professional_absences, a separate table), multiple time zones (the whole
-- app already assumes a single fixed clinic time zone — see Configuración's
-- own Preferencias regionales section), recurring-but-dated rules. Same
-- "modelo mínimo" scope as every other Configuración-backing table
-- (rooms, treatments).
create table public.professional_availability (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized from professional_profiles.clinic_id, same reasoning as
  -- appointments.clinic_id / professional_profiles.clinic_id itself: keeps
  -- every RLS policy here a single-hop check, and the composite FK below
  -- makes an inconsistent (professional_profile_id, clinic_id) pair
  -- structurally impossible to insert.
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  professional_profile_id uuid not null,
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_availability_day_of_week_check check (day_of_week between 1 and 7),
  constraint professional_availability_time_range_check check (start_time < end_time),
  constraint professional_availability_profile_clinic_fk
    foreign key (professional_profile_id, clinic_id)
    references public.professional_profiles (id, clinic_id)
    on delete cascade
);

create trigger set_updated_at
  before update on public.professional_availability
  for each row execute function public.set_updated_at();

create index professional_availability_clinic_id_idx on public.professional_availability (clinic_id);
create index professional_availability_profile_id_idx on public.professional_availability (professional_profile_id);

alter table public.professional_availability enable row level security;

-- Reusable "may this caller manage THIS professional's schedule" check —
-- same shape as can_access_appointment (appointments migration), minus its
-- assistant clause: Assistant can create/reschedule appointments (needs
-- SELECT here, see below) but never edits availability/absences (task
-- scope, explicit). clinic_admin manages any professional in her clinic,
-- including her own professional_profile if she has one ("Clinic Admin
-- odontólogo puede gestionar el suyo" falls out of this for free — she's
-- clinic_admin either way, no special-casing needed). A dentist is scoped
-- to only her OWN professional_profile, at the RLS layer — never another
-- dentist's, and never accepts a client-supplied clinic_id/profile_id
-- without this check re-validating it against real membership rows.
-- Reused by professional_absences below (same permission shape exactly).
create function public.can_manage_professional_schedule(target_clinic_id uuid, target_professional_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_clinic_role(target_clinic_id, array['clinic_admin']::public.membership_role[])
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

revoke execute on function public.can_manage_professional_schedule(uuid, uuid) from public;
grant execute on function public.can_manage_professional_schedule(uuid, uuid) to authenticated;

-- SELECT: any active member of the clinic, Assistant included — Nueva
-- cita/reprogramar (any role that books appointments) needs to read
-- availability to show a friendly "fuera de horario" pre-check client-side
-- (appointments-actions.ts), same reasoning as rooms_select_member.
create policy professional_availability_select_member
  on public.professional_availability for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

create policy professional_availability_insert_scoped
  on public.professional_availability for insert
  to authenticated
  with check (public.can_manage_professional_schedule(clinic_id, professional_profile_id));

create policy professional_availability_update_scoped
  on public.professional_availability for update
  to authenticated
  using (public.can_manage_professional_schedule(clinic_id, professional_profile_id))
  with check (public.can_manage_professional_schedule(clinic_id, professional_profile_id));

-- DELETE allowed (unlike rooms/treatments' active=false-only convention):
-- a schedule block has no history/FK depending on it existing forever (no
-- appointment snapshots a block's own row) — removing a wrongly-added
-- block is a plain delete; `active` still exists for a lower-friction
-- pause/resume of a block without retyping it.
create policy professional_availability_delete_scoped
  on public.professional_availability for delete
  to authenticated
  using (public.can_manage_professional_schedule(clinic_id, professional_profile_id));

grant select, insert, update, delete on public.professional_availability to authenticated;
