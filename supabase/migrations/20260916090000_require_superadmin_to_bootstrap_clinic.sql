-- Odentia Core — close the self-service clinic-creation backdoor in
-- bootstrap_clinic()
--
-- Product direction (PROMPT NINJA "Checkpoint 1A"): Odentia Core is moving
-- away from self-service clinic creation to a commercial/provisioning
-- model controlled by SUPERADMIN. This migration closes ONLY the backend
-- authorization gap — it does not touch /registro, onboarding UI, the
-- landing CTAs, or add the future provision_clinic()/prospectos work.
-- Those are separate, later checkpoints by design: this one exists to
-- validate the authorization fix in isolation first.
--
-- The gap: bootstrap_clinic() is SECURITY DEFINER with EXECUTE granted to
-- `authenticated`, but its body only ever checked "is there a session at
-- all" (auth.uid() is not null) — never WHO that session belongs to. Any
-- authenticated Dentist, Assistant, or Patient (or a brand-new signup that
-- never touched the onboarding wizard) could call
-- supabase.rpc('bootstrap_clinic', {...}) directly and become clinic_admin
-- of an arbitrary new clinic, regardless of what the UI does or doesn't
-- expose. Hiding the /registro wizard would not have closed this.
--
-- public.platform_roles / public.is_platform_superadmin() already exist
-- (foundation schema + RLS migration, 20260824210644 / 20260824212631)
-- and are already the real authorization primitive used by several RLS
-- policies (clinics/clinic_locations/clinic_memberships/
-- professional_profiles SELECT, specialties INSERT/UPDATE) — this
-- migration is the first place an RPC's own body enforces it directly,
-- same pattern every other privileged RPC in this schema already uses for
-- its own role (e.g. invite_clinic_member's has_clinic_role check),
-- just with is_platform_superadmin() as the predicate instead.
--
-- TWO LIVE OVERLOADS, NOT ONE — this is the one non-obvious part of this
-- change, found while preparing it, not assumed from the audit alone.
-- Postgres's CREATE OR REPLACE FUNCTION only replaces a function whose
-- argument-type list matches EXACTLY; appending new parameters (even with
-- DEFAULT values) creates a distinct, additional overload instead of
-- extending the original. 20260826162841_add_clinic_location_coordinates
-- appended location_latitude/location_longitude and its own comment
-- claimed this was "the same identity, no new overload" — that claim does
-- not hold under real Postgres semantics, and the two lineages below have
-- been diverging independently ever since:
--   - the ORIGINAL 20-argument signature (no location_latitude/
--     location_longitude) was last replaced by
--     20260914090000_seed_default_professional_availability, which added
--     the seed_default_professional_availability() call to it.
--   - the 22-argument signature (with location_latitude/
--     location_longitude), created by 20260826162841, was last replaced
--     by 20260912090000_seed_default_treatments_on_bootstrap, which added
--     the default `treatments` seed to it.
-- The real onboarding client (src/features/onboarding/api.ts,
-- bootstrapClinic()) always sends location_latitude/location_longitude as
-- named RPC arguments, so PostgREST resolves every real call to the
-- 22-argument overload specifically — that one currently lacks the
-- professional-availability seed the 20-argument one has, an existing,
-- unrelated behavioral divergence between the two this migration does NOT
-- attempt to fix (out of this checkpoint's scope — "no arregles fallos no
-- relacionados"). What this migration DOES do is guard BOTH overloads
-- identically: securing only the one currently called by the UI would
-- leave the other one — still EXECUTE-granted to `authenticated`, still
-- directly callable by a raw RPC/HTTP request that simply omits the two
-- coordinate arguments — as a live, un-gated bypass of this exact fix.
--
-- Both functions below are CREATE OR REPLACE against their own existing,
-- EXACT argument-type signature (verified against the migrations that
-- last defined each one), so EXECUTE grants are preserved unchanged from
-- what's already in place (`authenticated` only, never `anon` — no grant
-- statement is repeated here, matching this repo's own convention of only
-- restating grants when a signature actually changes). No privilege is
-- widened. Every other line of each function body — validation, the
-- clinics/clinic_locations/clinic_memberships/professional_profiles
-- inserts, the availability/treatments seeding, the return shape — is
-- copied byte-for-byte from each overload's current, live definition;
-- the only functional change in either function is the new authorization
-- check inserted immediately after the existing auth.uid() session check
-- and before anything else (including the pre-existing "orphaned
-- profile" lookup, which is itself only a SELECT with no side effect, but
-- the new check is placed first regardless so a rejected caller never
-- reaches any further logic at all).

-- ============================================================
-- bootstrap_clinic — 20-argument overload (original signature, no
-- location_latitude/location_longitude; currently carries the
-- professional-availability seed)
-- ============================================================
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
  bio text default null
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

  -- Checkpoint 1A: the actual fix. authenticated alone is no longer
  -- enough — only a real platform superadmin may provision a clinic.
  -- Placed immediately after the session check and before any other read
  -- or write, so a rejected caller never reaches the rest of the
  -- function.
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

  insert into public.clinics (name, slug, legal_name, tax_id, email, phone, logo_url)
  values (btrim(clinic_name), v_slug, clinic_legal_name, clinic_tax_id, clinic_email, clinic_phone, clinic_logo_url)
  returning id into v_clinic_id;

  insert into public.clinic_locations (
    clinic_id, name, address, city, state, country, phone, timezone, is_primary, active
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
    true
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

    perform public.seed_default_professional_availability(v_professional_profile_id, v_clinic_id);
  end if;

  return query select v_clinic_id, v_slug, v_location_id, v_membership_id, v_professional_profile_id;
end;
$$;


-- ============================================================
-- bootstrap_clinic — 22-argument overload (with location_latitude/
-- location_longitude; this is the one the real onboarding client actually
-- calls, and currently carries the default-treatments seed)
-- ============================================================
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
