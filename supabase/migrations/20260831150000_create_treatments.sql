-- Odentia Core — Tratamientos: catálogo real por clínica
--
-- Replaces the hardcoded TREATMENT_OPTIONS array (dashboard/mock-data.ts)
-- backing "Nueva cita"'s Tratamiento picker with a real, tenant-scoped
-- table. Operational config, not a clinical record in itself (a `Cita`
-- already stores its own `reason` as a free-text snapshot at creation time,
-- not a FK to this table — see the appointments migration's own comment on
-- `reason`) — so this follows the clinic_memberships/professional_profiles
-- convention (cascade on clinic delete) rather than patients/appointments'
-- restrict convention. No physical DELETE anywhere here: `active = false`
-- is the only lifecycle, same convention as patients/professional_profiles
-- — deactivating (or renaming) a treatment can never retroactively break an
-- appointment that already recorded its name.

create table public.treatments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint treatments_clinic_id_name_key unique (clinic_id, name)
);

create trigger set_updated_at
  before update on public.treatments
  for each row execute function public.set_updated_at();

create index treatments_clinic_id_idx on public.treatments (clinic_id);
create index treatments_clinic_id_active_idx on public.treatments (clinic_id, active);

alter table public.treatments enable row level security;

-- SELECT: any active member of the clinic — clinic_admin, dentist, and
-- assistant all create appointments (see can_access_appointment in the
-- appointments migration) and therefore all need to read the active
-- catalog for the Tratamiento picker; this isn't scoped per-professional
-- the way appointments/patients are, so is_clinic_member() (not
-- has_clinic_role()) is the right check.
create policy treatments_select_member
  on public.treatments for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

-- INSERT/UPDATE: clinic_admin only — managing the treatment catalog is
-- clinic-wide configuration (see CLAUDE.md Domain Model: Dentist "does not
-- manage... clinic-wide configuration"; Assistant "does not manage...
-- administrative configuration"). No DELETE policy: active=false is the
-- only lifecycle, enforced here, not just by the app not offering a delete
-- button.
create policy treatments_insert_admin
  on public.treatments for insert
  to authenticated
  with check (public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[]));

create policy treatments_update_admin
  on public.treatments for update
  to authenticated
  using (public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[]))
  with check (public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[]));

grant select, insert, update on public.treatments to authenticated;

-- Seed: TREATMENT_OPTIONS (dashboard/mock-data.ts) was the fixed catalog
-- every real clinic effectively used before this table existed. Seed it
-- once per EXISTING clinic as their starting catalog, so today's Nueva
-- cita Tratamiento picker doesn't go from 8 options to 0 the moment this
-- ships — clinics created after this migration start with an empty
-- catalog instead (bootstrap_clinic is deliberately not touched here; a
-- new clinic's admin builds her own catalog from Configuración →
-- Tratamientos). ON CONFLICT DO NOTHING relies on
-- treatments_clinic_id_name_key, so this block is safe to run more than
-- once and never produces duplicates.
insert into public.treatments (clinic_id, name)
select c.id, t.name
from public.clinics c
cross join (
  values
    ('Primera consulta'),
    ('Chequeo general'),
    ('Limpieza dental'),
    ('Blanqueamiento dental'),
    ('Extracción dental'),
    ('Tratamiento de conductos'),
    ('Consulta de ortodoncia'),
    ('Control de ortodoncia')
) as t (name)
on conflict (clinic_id, name) do nothing;
