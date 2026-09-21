-- Odentia Core — align bootstrap_clinic()'s 22-argument overload with its
-- 20-argument sibling: seed default professional availability for a
-- founder dentist too.
--
-- Confirmed gap (read-only audit, prompt ninja "cerrar semántica de
-- Availability initialization"): bootstrap_clinic() has had two live
-- overloads since 20260826162841 (see 20260916090000's own comment for
-- the full history of how that happened). 20260914090000 added the
-- perform public.seed_default_professional_availability(...) call to the
-- ORIGINAL 20-argument overload's `if is_dentist then` branch, but never
-- touched the 22-argument one (with location_latitude/location_longitude)
-- — so a founder dentist created through that overload got a
-- professional_profiles row with zero professional_availability rows,
-- unlike every other professional-creation path
-- (accept_clinic_invitation dentist, create_my_professional_profile,
-- and the 20-argument bootstrap_clinic overload itself), which all seed
-- correctly. This migration closes that one inconsistency.
--
-- Scope/impact, confirmed during the same audit: since migration
-- 20260916090000 ("Checkpoint 1A"), BOTH bootstrap_clinic() overloads
-- require public.is_platform_superadmin() — the real onboarding client
-- (src/features/onboarding/api.ts, the only real caller, always resolves
-- to this 22-argument overload) is used by an ordinary new signup, never
-- a platform superadmin, so that call already fails at the authorization
-- check today, before ever reaching the professional_profiles insert.
-- This fix therefore closes a latent/defense-in-depth inconsistency in a
-- function that CLAUDE.md still documents as "retained only until [self-
-- service] is formally retired" — it does NOT currently unblock or change
-- behavior for any real signup in production.
--
-- Deliberately NOT in scope here (see CLAUDE.md's Availability & Absences
-- section, unchanged by this migration): the "zero availability rows ->
-- legacy unrestricted" fallback for historical professionals stays
-- exactly as-is, on purpose — this migration seeds a NEW professional
-- going forward, it never backfills an existing professional_profiles
-- row with zero rows today (e.g. no change for any already-provisioned
-- clinic/professional).
--
-- CREATE OR REPLACE against this overload's EXACT, currently-live
-- 22-argument signature (copied byte-for-byte from 20260916090000, the
-- last migration that defined it) — same identity, so EXECUTE grants are
-- preserved unchanged (authenticated only, never anon; no grant statement
-- repeated here, matching this repo's own convention of only restating
-- grants when a signature actually changes). The ONLY functional change
-- inside the body is the new perform call, added immediately after the
-- professional_profiles insert inside `if is_dentist then`, using the
-- exact same pattern the 20-argument overload already has. Every other
-- line — is_platform_superadmin() gate, validation, the clinics/
-- clinic_locations/clinic_memberships/professional_profiles/treatments
-- inserts, the return shape — is unchanged.
--
-- Not touched by this migration: the 20-argument overload (already
-- correct), seed_default_professional_availability() itself (already
-- idempotent, already the single source of truth for the L-V 08:00-17:00
-- default), validate_appointment_availability(), and every Agenda/
-- appointments-actions.ts consumer of professional_availability.

create or replace function public.bootstrap_clinic(
  clinic_name text,
  clinic_slug text,
  clinic_legal_name text default null,
  clinic_tax_id text default null,
  clinic_email text default null,
  clinic_phone text default null,
  clinic_logo_url text default null,
  location_name text default null,
  location_address text default null,
  location_city text default null,
  location_state text default null,
  location_country text default null,
  location_phone text default null,
  location_timezone text default null,
  is_dentist boolean default false,
  primary_specialty_id uuid default null,
  license_number text default null,
  agenda_color text default null,
  default_appointment_duration_minutes integer default null,
  bio text default null,
  location_latitude double precision default null,
  location_longitude double precision default null
)
returns table (
  clinic_id uuid,
  slug text,
  location_id uuid,
  membership_id uuid,
  professional_profile_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_slug text;
  v_clinic_id uuid;
  v_location_id uuid;
  v_membership_id uuid;
  v_professional_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'bootstrap_clinic requires an authenticated session';
  end if;

  -- Checkpoint 1A: same guard as the 20-argument overload above — see its
  -- own comment. Both overloads must be gated identically, since either
  -- one is independently reachable via a raw RPC call regardless of which
  -- one the current UI happens to invoke.
  if not public.is_platform_superadmin() then
    raise exception 'only a platform superadmin can bootstrap a clinic' using errcode = '42501';
  end if;

  select p.id into v_profile_id from public.profiles p where p.id = auth.uid();
  if v_profile_id is null then
    raise exception 'no profiles row found for authenticated user %; cannot bootstrap a clinic', auth.uid();
  end if;

  if clinic_name is null or btrim(clinic_name) = '' then
    raise exception 'clinic_name must not be empty';
  end if;

  v_slug := lower(btrim(clinic_slug));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    raise exception 'clinic_slug must contain at least one alphanumeric character';
  end if;

  if primary_specialty_id is not null then
    perform 1 from public.specialties s where s.id = primary_specialty_id and s.active;
    if not found then
      raise exception 'specialty % does not exist or is not active', primary_specialty_id;
    end if;
  end if;

  if (location_latitude is null) is distinct from (location_longitude is null) then
    raise exception 'location_latitude and location_longitude must both be provided or both be null';
  end if;
  if location_latitude is not null and (location_latitude < -90 or location_latitude > 90) then
    raise exception 'location_latitude must be between -90 and 90';
  end if;
  if location_longitude is not null and (location_longitude < -180 or location_longitude > 180) then
    raise exception 'location_longitude must be between -180 and 180';
  end if;

  insert into public.clinics (name, slug, legal_name, tax_id, email, phone, logo_url)
  values (btrim(clinic_name), v_slug, clinic_legal_name, clinic_tax_id, clinic_email, clinic_phone, clinic_logo_url)
  returning id into v_clinic_id;

  insert into public.clinic_locations (
    clinic_id, name, address, city, state, country, phone, timezone, is_primary, active,
    latitude, longitude
  )
  values (
    v_clinic_id,
    coalesce(nullif(btrim(location_name), ''), 'Sede principal'),
    location_address,
    location_city,
    location_state,
    coalesce(nullif(btrim(location_country), ''), 'CO'),
    location_phone,
    coalesce(nullif(btrim(location_timezone), ''), 'America/Bogota'),
    true,
    true,
    location_latitude,
    location_longitude
  )
  returning id into v_location_id;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, invited_by, joined_at)
  values (v_clinic_id, v_profile_id, 'clinic_admin', 'active', null, now())
  returning id into v_membership_id;

  if is_dentist then
    insert into public.professional_profiles (
      clinic_membership_id, clinic_id, primary_specialty_id, license_number,
      agenda_color, default_appointment_duration_minutes, bio, active
    )
    values (
      v_membership_id, v_clinic_id, primary_specialty_id, license_number,
      agenda_color, default_appointment_duration_minutes, bio, true
    )
    returning id into v_professional_profile_id;

    -- THE FIX: same call the 20-argument overload already makes, right
    -- after its own professional_profiles insert. Idempotent (no-op if
    -- any availability row already exists for this profile) and
    -- multi-tenant-checked inside seed_default_professional_availability()
    -- itself — see 20260914090000.
    perform public.seed_default_professional_availability(v_professional_profile_id, v_clinic_id);
  end if;

  insert into public.treatments (clinic_id, name)
  select v_clinic_id, t.name
  from (
    values
      ('Primera consulta'),
      ('Chequeo general'),
      ('Limpieza dental'),
      ('Blanqueamiento dental'),
      ('Extracción dental'),
      ('Tratamiento de conductos'),
      ('Consulta de ortodoncia'),
      ('Control de ortodoncia')
  ) as t (name);

  return query select v_clinic_id, v_slug, v_location_id, v_membership_id, v_professional_profile_id;
end;
$$;
