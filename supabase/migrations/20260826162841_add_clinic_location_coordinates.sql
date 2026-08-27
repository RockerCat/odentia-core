-- Odentia Core — clinic_locations coordinates + bootstrap_clinic() update
--
-- Adds optional latitude/longitude to clinic_locations so the onboarding's
-- real address search (Paso 2 — see src/features/onboarding) can capture
-- where the sede principal actually is, and extends bootstrap_clinic() to
-- accept them so they're written in the same atomic insert as everything
-- else — never a follow-up UPDATE after bootstrap.
--
-- `double precision` (not PostGIS/geography): all this needs for V1 is
-- "show a pin on a static confirmation map" — no distance queries, no
-- spatial indexes, no polygon lookups. PostGIS is a real dependency
-- (extension, index strategy, query patterns) with no concrete Odentia use
-- case yet; introducing it speculatively would be exactly the
-- overengineering CLAUDE.md tells us to avoid. Revisit only if/when a real
-- feature needs actual spatial queries (e.g. "clínicas cercanas").

-- ============================================================
-- clinic_locations — optional coordinates
-- ============================================================

alter table public.clinic_locations
  add column latitude double precision,
  add column longitude double precision;

-- Range checks: silently invalid coordinates (e.g. lng/lat swapped by a
-- future caller) are worse than a loud rejection. Both-or-neither: a
-- location that's "half geocoded" (e.g. latitude present, longitude lost
-- to a bug) is meaningless for pin placement — never allow that partial
-- state to persist. NULL/NULL (fully manual entry, no geocoding
-- available) is the legitimate default and stays valid.
alter table public.clinic_locations
  add constraint clinic_locations_latitude_range
    check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table public.clinic_locations
  add constraint clinic_locations_longitude_range
    check (longitude is null or (longitude >= -180 and longitude <= 180));

alter table public.clinic_locations
  add constraint clinic_locations_lat_lng_both_or_neither
    check ((latitude is null) = (longitude is null));


-- ============================================================
-- bootstrap_clinic() — accept location_latitude/location_longitude
-- ============================================================
--
-- create or replace, not drop+create: every existing parameter keeps its
-- exact name/type/position — this only appends two new nullable
-- parameters at the end, which Postgres allows to replace the function
-- in place (same identity, same EXECUTE grants, no new overload). Anyone
-- still calling the old 20-argument shape keeps working unchanged.
--
-- Everything else — auth.uid()-only identity, SECURITY DEFINER, the
-- postgres owner, `set search_path = ''`, the existing validation, the
-- single-transaction atomicity across clinics/clinic_locations/
-- clinic_memberships/professional_profiles — is unchanged from the
-- original migration; only the two new parameters, their validation, and
-- the clinic_locations insert list are new.

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
  -- 1. Identity: only auth.uid(), never a client-supplied profile id.
  -- This is what makes "user A bootstraps a clinic with user B as admin"
  -- structurally impossible — there is no parameter that could carry B's
  -- id into clinic_memberships.profile_id.
  if auth.uid() is null then
    raise exception 'bootstrap_clinic requires an authenticated session';
  end if;

  select p.id into v_profile_id from public.profiles p where p.id = auth.uid();
  if v_profile_id is null then
    -- Should be unreachable in practice (handle_new_user creates profiles
    -- on signup) — failing loudly here is deliberate: an orphaned
    -- clinic_memberships row with no real profile behind it would be a
    -- much worse failure mode than refusing to bootstrap.
    raise exception 'no profiles row found for authenticated user %; cannot bootstrap a clinic', auth.uid();
  end if;

  -- 2. Minimal structural validation — not a validation framework, just
  -- enough that the RPC can't be fed structurally empty data. UX-level
  -- validation belongs to the future form, not here.
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

  -- 2b. Coordinates: same both-or-neither + range rule as the table
  -- constraint below, checked here too so a bad call fails with a clear
  -- RPC-level exception instead of a raw constraint-violation error.
  if (location_latitude is null) is distinct from (location_longitude is null) then
    raise exception 'location_latitude and location_longitude must both be provided or both be null';
  end if;
  if location_latitude is not null and (location_latitude < -90 or location_latitude > 90) then
    raise exception 'location_latitude must be between -90 and 90';
  end if;
  if location_longitude is not null and (location_longitude < -180 or location_longitude > 180) then
    raise exception 'location_longitude must be between -180 and 180';
  end if;

  -- 3. clinics. clinics.slug is UNIQUE — this is also this version's
  -- double-submit guard (see migration header note below) rather than a
  -- dedicated idempotency-key table: a retried bootstrap_clinic call sent
  -- with the same slug fails here with a unique_violation instead of
  -- creating a second clinic. It does not stop a retry that generates a
  -- fresh slug per attempt, but that's a client-construction concern, not
  -- something worth a new table for at this stage — documented, not
  -- silently assumed away.
  insert into public.clinics (name, slug, legal_name, tax_id, email, phone, logo_url)
  values (btrim(clinic_name), v_slug, clinic_legal_name, clinic_tax_id, clinic_email, clinic_phone, clinic_logo_url)
  returning id into v_clinic_id;

  -- 4. clinic_locations — sede principal. Defaults mirror the column
  -- defaults from the foundation schema migration (country 'CO',
  -- timezone 'America/Bogota') rather than relying on omitted-column
  -- fallback, since every column here is explicitly listed in the INSERT.
  -- latitude/longitude are written here directly — never a follow-up
  -- UPDATE after bootstrap.
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

  -- 5. clinic_memberships — the creator is always clinic_admin, never a
  -- parameter. invited_by stays NULL: nobody invited the founder.
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, invited_by, joined_at)
  values (v_clinic_id, v_profile_id, 'clinic_admin', 'active', null, now())
  returning id into v_membership_id;

  -- 6. professional_profiles — only when the admin also practices.
  -- Attached to THIS membership, never a second membership — this is the
  -- "Administrador Odontólogo" representation from the v1 data model.
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

  return query select v_clinic_id, v_slug, v_location_id, v_membership_id, v_professional_profile_id;
end;
$$;

-- EXECUTE grants unchanged in spirit (authenticated only, never anon) —
-- restated because create or replace does not require re-granting, but
-- the function's argument-type signature string changed (two new trailing
-- params), so the old revoke/grant statements below would no longer
-- resolve to this function if left unrepeated.
revoke execute on function public.bootstrap_clinic(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text,
  boolean, uuid, text, text, integer, text, double precision, double precision
) from public;

grant execute on function public.bootstrap_clinic(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text,
  boolean, uuid, text, text, integer, text, double precision, double precision
) to authenticated;
