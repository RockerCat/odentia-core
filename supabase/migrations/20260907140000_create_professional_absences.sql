-- Odentia Core — Configuración real: Ausencias/vacaciones del profesional
--
-- Replaces the mock ABSENCES_MOCK/ABSENCES_BY_DENTIST (dentist-mock-data.ts)
-- with real, tenant-scoped persistence. Deliberately date-only (whole-day
-- granularity) — the task's own "modelo mínimo" lists fecha inicio/fecha
-- fin/motivo/status, no time-of-day fields, and a partial-day absence
-- would meaningfully complicate the availability-conflict check in the
-- appointments trigger (this migration's own follow-up) for no requested
-- benefit. The previous mock's allDay/startTime/endTime split is not
-- carried over; see the accompanying UI changes (ausencia-modal.tsx).
create table public.professional_absences (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  professional_profile_id uuid not null,
  start_date date not null,
  end_date date not null,
  reason text,
  -- Logical cancel, same convention as everywhere else in this schema
  -- (rooms/treatments/professional_profiles' own `active`) — "Eliminar" in
  -- the UI still does a real DELETE (matches the previously-approved
  -- Ausencias design exactly), `active` exists for a future non-destructive
  -- cancel and is what the appointments trigger checks.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_absences_date_range_check check (end_date >= start_date),
  constraint professional_absences_profile_clinic_fk
    foreign key (professional_profile_id, clinic_id)
    references public.professional_profiles (id, clinic_id)
    on delete cascade
);

create trigger set_updated_at
  before update on public.professional_absences
  for each row execute function public.set_updated_at();

create index professional_absences_clinic_id_idx on public.professional_absences (clinic_id);
create index professional_absences_profile_id_idx on public.professional_absences (professional_profile_id);

alter table public.professional_absences enable row level security;

-- Same policy shape as professional_availability — reuses
-- can_manage_professional_schedule (defined alongside that table); SELECT
-- open to any clinic member (Assistant included) so Nueva cita's own
-- client-side pre-check can read active absences, same reasoning as
-- professional_availability_select_member.
create policy professional_absences_select_member
  on public.professional_absences for select
  to authenticated
  using (public.is_clinic_member(clinic_id));

create policy professional_absences_insert_scoped
  on public.professional_absences for insert
  to authenticated
  with check (public.can_manage_professional_schedule(clinic_id, professional_profile_id));

create policy professional_absences_update_scoped
  on public.professional_absences for update
  to authenticated
  using (public.can_manage_professional_schedule(clinic_id, professional_profile_id))
  with check (public.can_manage_professional_schedule(clinic_id, professional_profile_id));

create policy professional_absences_delete_scoped
  on public.professional_absences for delete
  to authenticated
  using (public.can_manage_professional_schedule(clinic_id, professional_profile_id));

grant select, insert, update, delete on public.professional_absences to authenticated;
