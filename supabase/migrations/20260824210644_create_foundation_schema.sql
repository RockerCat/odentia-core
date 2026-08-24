-- Odentia Core — Foundation schema (Modelo de Datos v1)
--
-- Creates the 11 foundational tables approved in the v1 data model design:
-- profiles, platform_roles, specialties, clinics, clinic_locations,
-- clinic_memberships, professional_profiles, clinic_invitations, patients,
-- patient_access_invitations, patient_user_links.
--
-- Explicitly OUT of scope for this migration (by design, not oversight):
-- RLS policies, is_clinic_member()/is_superadmin() helpers, seed data,
-- appointments/appointment_requests, clinical history, odontogram,
-- reports, subscriptions, rooms, schedules, marketplace.
--
-- RLS is enabled on every table below with zero policies attached, so the
-- Data API (anon/authenticated) has no access to anything created here
-- until the policies migration (Paso 3D) adds them. Only postgres/
-- service_role (which bypass RLS) can read/write until then.

-- ============================================================
-- Enums
-- ============================================================
-- Postgres enums, not text+check, for the 5 role/status vocabularies that
-- are already fixed by the approved domain model. Every other status field
-- in this schema (clinics.status, membership.status, etc.) only ever takes
-- these known values — an enum gives that for free at the type level.
-- Nothing speculative is enumerated here (e.g. no clinics 'trial' — that
-- belongs to the future `subscriptions` domain, not this one).

create type public.clinic_status as enum ('active', 'suspended');

create type public.membership_role as enum ('clinic_admin', 'dentist', 'assistant');
-- Deliberately excludes 'patient' and 'superadmin': a Patient is never a
-- clinic team member, and Superadmin is a platform-level capability, not a
-- clinic membership — see platform_roles below.

create type public.membership_status as enum ('active', 'suspended', 'inactive');

create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');

create type public.platform_role as enum ('superadmin');


-- ============================================================
-- updated_at trigger — one shared function for every mutable table
-- ============================================================

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- profiles — 1:1 with auth.users
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- on delete cascade: a profile with no underlying auth.users row is
-- meaningless — deleting the Auth account is exactly the case where the
-- child record "no tiene sentido sin el padre".

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-provisioning trigger: creates a profiles row whenever a new
-- auth.users row is inserted (signup). first_name/last_name are NOT NULL,
-- but signup metadata is NOT guaranteed to include them (OAuth, magic
-- link, or any signUp() call that omits `options.data`) — signup must
-- never fail because of that. Resolution: read first_name/last_name
-- directly from raw_user_meta_data if the signup flow provided them
-- (Odentia's own signup form will), defaulting to '' otherwise. No
-- full_name-splitting heuristics — those are fragile (single-word names,
-- extra whitespace) for no real benefit; an empty name is trivially
-- completed later via a "complete your profile" prompt in the UI, whereas
-- a failed trigger blocks account creation entirely.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- platform_roles — superadmin, global, never a fake clinic
-- ============================================================

create table public.platform_roles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  role public.platform_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);
-- profile_id cascade: a role grant for a person who no longer exists is
-- meaningless. granted_by set null: losing the record of *who* granted it
-- must never destroy the grant itself.


-- ============================================================
-- specialties — global catalog, not clinic-scoped
-- ============================================================

create table public.specialties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint specialties_name_key unique (name)
);

create trigger set_updated_at
  before update on public.specialties
  for each row execute function public.set_updated_at();

-- No seed data here by design — left for a dedicated seed step.


-- ============================================================
-- clinics — the tenant
-- ============================================================

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  legal_name text,
  tax_id text,
  email text,
  phone text,
  logo_url text,
  status public.clinic_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinics_slug_key unique (slug)
);

create trigger set_updated_at
  before update on public.clinics
  for each row execute function public.set_updated_at();


-- ============================================================
-- clinic_locations — sedes; multi-sede-ready, MVP behaves as one
-- ============================================================

create table public.clinic_locations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  address text,
  city text,
  state text,
  -- Default only, freely overridable per row — matches the current
  -- Colombia-only mock data, not a hardcoded business rule.
  country text not null default 'CO',
  phone text,
  timezone text not null default 'America/Bogota',
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- clinic_id cascade: a location cannot outlive its clinic — it has no
-- independent meaning.

create trigger set_updated_at
  before update on public.clinic_locations
  for each row execute function public.set_updated_at();

-- Exactly one primary location per clinic, enforced structurally rather
-- than by application logic.
create unique index clinic_locations_one_primary_per_clinic
  on public.clinic_locations (clinic_id)
  where is_primary;


-- ============================================================
-- clinic_memberships — the pertenencia unit: person + clinic + role
-- ============================================================

create table public.clinic_memberships (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.membership_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_memberships_clinic_id_profile_id_key unique (clinic_id, profile_id),
  -- Referenced by professional_profiles' composite FK below — lets a
  -- child table denormalize clinic_id and still have Postgres guarantee
  -- it can never diverge from the membership's real clinic.
  constraint clinic_memberships_id_clinic_id_key unique (id, clinic_id)
);
-- clinic_id cascade: an operational access record (not clinical data) —
-- has no meaning once its clinic is gone. profile_id cascade: same
-- reasoning from the person's side. invited_by set null: losing the
-- inviter's own profile must not destroy the membership.

create trigger set_updated_at
  before update on public.clinic_memberships
  for each row execute function public.set_updated_at();

create index clinic_memberships_clinic_id_idx on public.clinic_memberships (clinic_id);
create index clinic_memberships_profile_id_status_idx on public.clinic_memberships (profile_id, status);
create index clinic_memberships_clinic_id_status_idx on public.clinic_memberships (clinic_id, status);


-- ============================================================
-- professional_profiles — clinical/operational capacity of ONE membership
-- ============================================================

create table public.professional_profiles (
  id uuid primary key default gen_random_uuid(),
  clinic_membership_id uuid not null,
  -- Denormalized from clinic_memberships.clinic_id purely to keep future
  -- RLS policies a single-hop check instead of a join chain. Tenant
  -- consistency is NOT trusted to application code — see the composite FK
  -- below, which makes an inconsistent (clinic_membership_id, clinic_id)
  -- pair structurally impossible to insert.
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  primary_specialty_id uuid references public.specialties (id) on delete set null,
  license_number text,
  agenda_color text,
  default_appointment_duration_minutes integer,
  bio text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_profiles_clinic_membership_id_key unique (clinic_membership_id),
  constraint professional_profiles_membership_clinic_fk
    foreign key (clinic_membership_id, clinic_id)
    references public.clinic_memberships (id, clinic_id)
    on delete cascade
);
-- No CHECK/trigger restricting this to role IN ('clinic_admin','dentist'):
-- deliberately left to the application layer so the table stays open to
-- future professional types (higienista, auxiliar, etc.) without a
-- migration to loosen a DB constraint later.

create trigger set_updated_at
  before update on public.professional_profiles
  for each row execute function public.set_updated_at();

create index professional_profiles_clinic_id_idx on public.professional_profiles (clinic_id);


-- ============================================================
-- clinic_invitations — staff invitations, pre-membership
-- ============================================================

create table public.clinic_invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  email text not null,
  role public.membership_role not null,
  invited_by uuid not null references public.profiles (id) on delete restrict,
  token_hash text not null,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_membership_id uuid references public.clinic_memberships (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint clinic_invitations_token_hash_key unique (token_hash)
);
-- invited_by restrict: profile deletion is rare/deliberate; blocking it
-- while unresolved invitation records point to it is safer than silently
-- losing who issued a still-open invitation (NOT NULL rules out `set
-- null` here anyway). Only the raw token is sensitive — token_hash is
-- what's stored, never the plain token.

create index clinic_invitations_clinic_id_status_idx on public.clinic_invitations (clinic_id, status);


-- ============================================================
-- patients — clinic-scoped by design, never a cross-clinic identity
-- ============================================================

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  first_name text not null,
  last_name text not null,
  document_id text,
  phone text,
  email text,
  birth_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Referenced by patient_access_invitations' composite FK below, same
  -- tenant-consistency pattern as clinic_memberships/professional_profiles.
  constraint patients_id_clinic_id_key unique (id, clinic_id)
);
-- clinic_id RESTRICT, not cascade: patients is the first table here that
-- will carry clinical implications once historia clínica/odontograma land
-- on top of it. A clinic must never be deletable in a way that silently
-- wipes patient records — suspending it (clinics.status) is the intended
-- lifecycle tool instead. This is the conservative choice requested for
-- any table with future clinical weight.

create trigger set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

create index patients_clinic_id_idx on public.patients (clinic_id);

-- A patient may appear more than once across different clinics by the
-- same document_id (different clinics, independent records) but not
-- twice within the SAME clinic.
create unique index patients_clinic_id_document_id_key
  on public.patients (clinic_id, document_id)
  where document_id is not null;


-- ============================================================
-- patient_access_invitations — pre-authorization for a patient to claim
-- their own record via QR/link (see patient_user_links below)
-- ============================================================

create table public.patient_access_invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_id uuid not null,
  token_hash text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint patient_access_invitations_token_hash_key unique (token_hash),
  -- Same structural guarantee as professional_profiles: clinic_id can
  -- never diverge from the referenced patient's real clinic.
  constraint patient_access_invitations_patient_clinic_fk
    foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id)
    on delete cascade
);
-- patient_id cascade: these are access-provisioning artifacts, not
-- clinical data — an invitation for a deleted patient has no purpose.
-- created_by restrict: same reasoning as clinic_invitations.invited_by.
-- Token validation itself (hashing/consuming) is NOT implemented here —
-- that RPC is a later task, per scope.

create index patient_access_invitations_clinic_id_idx on public.patient_access_invitations (clinic_id);
create index patient_access_invitations_patient_id_idx on public.patient_access_invitations (patient_id);


-- ============================================================
-- patient_user_links — the ONLY connection from a patient record to an
-- authenticated account; created solely by consuming a valid
-- patient_access_invitations token (never by identity matching)
-- ============================================================

create table public.patient_user_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  patient_access_invitation_id uuid not null references public.patient_access_invitations (id) on delete restrict,
  linked_at timestamptz not null default now(),
  constraint patient_user_links_patient_id_key unique (patient_id),
  constraint patient_user_links_patient_access_invitation_id_key unique (patient_access_invitation_id)
);
-- patient_id/profile_id cascade: the link has no purpose once either side
-- is gone (deleting a person's account never deletes the patient record
-- itself — only the claim on it). patient_access_invitation_id restrict:
-- preserves the audit trail of which authorization produced this link;
-- unique here also guarantees one invitation can never produce more than
-- one link. unique(patient_id) is what caps a patient record at exactly
-- one linked account.


-- ============================================================
-- Row Level Security — enabled everywhere, zero policies
-- ============================================================
-- Tables created via SQL migrations do NOT get RLS auto-enabled by
-- Supabase (that only happens for tables created through the Studio
-- table editor). Enabling it explicitly here, with no policies attached,
-- means the Data API (anon/authenticated roles) has zero access to any
-- of these tables until Paso 3D adds policies. Only postgres/service_role
-- (which bypass RLS) can read/write in the meantime.

alter table public.profiles enable row level security;
alter table public.platform_roles enable row level security;
alter table public.specialties enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_locations enable row level security;
alter table public.clinic_memberships enable row level security;
alter table public.professional_profiles enable row level security;
alter table public.clinic_invitations enable row level security;
alter table public.patients enable row level security;
alter table public.patient_access_invitations enable row level security;
alter table public.patient_user_links enable row level security;
