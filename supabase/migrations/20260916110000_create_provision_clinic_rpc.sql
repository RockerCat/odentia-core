-- Odentia Core — provision_clinic(): Superadmin-only clinic provisioning
--
-- Checkpoint 3 (Platform / Clínicas → creación directa de clínica por
-- Superadmin). bootstrap_clinic() cannot be reused here: BOTH of its live
-- overloads (see 20260916090000's own comment on why there are two)
-- unconditionally insert a clinic_memberships row for auth.uid() as
-- clinic_admin — correct for self-service (the caller IS the founding
-- admin), but exactly wrong for a Superadmin provisioning a clinic FOR a
-- future customer: she must never become an artificial member of every
-- clinic she creates (see CLAUDE.md Domain Model's Superadmin section).
-- bootstrap_clinic() itself is left completely untouched by this
-- migration — this is a new, separate function, not a refactor of it.
--
-- Same clinics/clinic_locations insert shape and the same default-
-- treatments seed as bootstrap_clinic()'s own 22-argument overload (so a
-- Superadmin-provisioned clinic is exactly as usable on day one as a
-- self-service one — Nueva cita's Tratamiento picker is never empty),
-- deliberately WITHOUT the clinic_memberships/professional_profiles
-- inserts: member provisioning is its own, later checkpoint, and the
-- clinic may legitimately exist with zero members until then.
--
-- Authorization: is_platform_superadmin() only, checked first, before any
-- write — never has_clinic_role (there is no membership to check), never
-- auth.uid() alone. Designed to be the SAME function a future
-- "Prospecto → Convertir" flow calls (see the read-only audit that scoped
-- this whole initiative) — Ruta A (from a prospecto) and Ruta B (direct,
-- this checkpoint) both converge here; neither needs to know about the
-- other, and adding Ruta A later needs no change to this function.
--
-- Naming/shape deliberately mirrors bootstrap_clinic()'s own
-- clinic_*/location_* parameters one-for-one (easy mental mapping, and
-- the client wrapper — src/features/platform/api.ts — reuses the exact
-- same slug-retry-on-unique-violation pattern) minus every role/
-- professional-profile parameter (is_dentist, primary_specialty_id,
-- license_number, agenda_color, default_appointment_duration_minutes,
-- bio) and clinic_logo_url — none of those apply to an admin-provisioned,
-- member-less clinic; a logo, like in the self-service flow, is only
-- ever set by a follow-up Storage upload once a real clinic_id exists,
-- never through this RPC, and this checkpoint's own admin form doesn't
-- offer one yet (out of scope, not a gap).
--
-- IMPORTANT for whoever extends this function later: use CREATE OR
-- REPLACE only against this EXACT parameter list. Appending new
-- parameters (even with DEFAULT values) does NOT replace this function in
-- Postgres — it creates a SEPARATE, additional overload that coexists
-- silently alongside this one. That exact mistake is what caused
-- bootstrap_clinic() to end up with two divergent live overloads (see
-- 20260916090000's own comment) — don't repeat it here. If a new
-- parameter is ever truly needed, DROP this function and CREATE it fresh
-- in the same migration, so there is only ever one provision_clinic().
create function public.provision_clinic(
  clinic_name text,
  clinic_slug text,
  clinic_legal_name text default null,
  clinic_tax_id text default null,
  clinic_email text default null,
  clinic_phone text default null,
  location_name text default null,
  location_address text default null,
  location_city text default null,
  location_state text default null,
  location_country text default null,
  location_phone text default null,
  location_timezone text default null,
  location_latitude double precision default null,
  location_longitude double precision default null
)
returns table (
  clinic_id uuid,
  slug text,
  location_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_clinic_id uuid;
  v_location_id uuid;
begin
  if auth.uid() is null then
    raise exception 'provision_clinic requires an authenticated session';
  end if;

  -- The actual gate. Checked before anything else, including reading
  -- profiles — a rejected caller triggers zero reads or writes beyond
  -- this check.
  if not public.is_platform_superadmin() then
    raise exception 'only a platform superadmin can provision a clinic' using errcode = '42501';
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

  -- Same both-or-neither + range rule as bootstrap_clinic()'s own
  -- 22-argument overload and clinic_locations' own CHECK constraints.
  if (location_latitude is null) is distinct from (location_longitude is null) then
    raise exception 'location_latitude and location_longitude must both be provided or both be null';
  end if;
  if location_latitude is not null and (location_latitude < -90 or location_latitude > 90) then
    raise exception 'location_latitude must be between -90 and 90';
  end if;
  if location_longitude is not null and (location_longitude < -180 or location_longitude > 180) then
    raise exception 'location_longitude must be between -180 and 180';
  end if;

  -- clinics.slug is UNIQUE — same double-submit guard as bootstrap_clinic
  -- (a retried call with the same slug fails here with a clear
  -- unique_violation instead of creating a second clinic).
  insert into public.clinics (name, slug, legal_name, tax_id, email, phone)
  values (btrim(clinic_name), v_slug, clinic_legal_name, clinic_tax_id, clinic_email, clinic_phone)
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

  -- Same default catalog every clinic gets today (see
  -- 20260912090000_seed_default_treatments_on_bootstrap.sql) — v_clinic_id
  -- is brand new here, so there is no existing row to collide with.
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

  -- Deliberately NO clinic_memberships insert, NO professional_profiles
  -- insert: this clinic exists with zero members until a later checkpoint
  -- provisions its first Clinic Admin.
  return query select v_clinic_id, v_slug, v_location_id;
end;
$$;

revoke execute on function public.provision_clinic(
  text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision
) from public;

grant execute on function public.provision_clinic(
  text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision
) to authenticated;
-- Not granted to anon: provisioning always requires a real, authenticated
-- session — is_platform_superadmin() is the actual authorization
-- boundary; this grant only lets an authenticated call reach the function
-- body at all (same "grant lets the check run, the function body/RLS is
-- the real filter" pattern as every GRANT in this schema, e.g.
-- invite_clinic_member/set_clinic_member_status).
