-- Odentia Core — SQL-layer regression test for
-- 20260921090000_fix_bootstrap_clinic_22arg_seed_availability.sql
--
-- Same conventions as supabase/tests/seed_default_professional_availability.test.sql
-- and supabase/tests/regenerate_clinic_invitation.test.sql: a plain psql
-- script (no pgTAP), meant to run against a local Supabase Postgres
-- (`supabase start` + `supabase db reset`) AFTER this migration has been
-- reviewed and applied there — NOT against the shared dev/prod project,
-- and NOT executed as part of this change (no local Postgres/docker
-- available in the sandbox this was written in — see the task's own
-- final report: NOT RUN locally).
--
-- bootstrap_clinic() resolves both auth.uid() and is_platform_superadmin()
-- itself, so this test impersonates a real platform superadmin via
-- set_config('request.jwt.claim.sub', ...) — the same trick
-- regenerate_clinic_invitation.test.sql already uses — backed by a real
-- (if minimal) auth.users row, since profiles.id carries a real FK down
-- to auth.users and handle_new_user auto-provisions the matching profiles
-- row. platform_roles is populated directly (superadmin grants have no
-- self-service path by design — see CLAUDE.md's Superadmin section).
--
-- Scope: this test only exercises the ONE thing this migration actually
-- changed — a founder dentist created through the 22-argument overload
-- (the one that accepts location_latitude/location_longitude, i.e. the
-- one the real onboarding client always resolves to) now gets the exact
-- same default availability as every other professional-creation path.
-- It does not re-test clinic_locations/clinic_memberships/treatments
-- creation, the coordinate validation, or the is_platform_superadmin()
-- gate itself — those are all unchanged by this migration and already
-- covered by this overload's own prior behavior/review.
--
-- Runs inside one transaction, always rolled back at the end: safe to run
-- repeatedly, never leaves fixture rows (including the auth.users one)
-- behind.

begin;

do $$
declare
  v_superadmin_user uuid;
  v_clinic_id uuid;
  v_slug text;
  v_location_id uuid;
  v_membership_id uuid;
  v_professional_profile_id uuid;
  v_count integer;
  v_days smallint[];
  v_row record;
begin
  -- ------------------------------------------------------------
  -- Fixture: one real platform superadmin (the only identity allowed to
  -- call bootstrap_clinic() at all since 20260916090000).
  -- ------------------------------------------------------------
  v_superadmin_user := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_superadmin_user, 'authenticated', 'authenticated',
    'superadmin@qa-bootstrap-22arg-test.local', 'x', now(), now(), now(), '{}', '{}'
  );
  -- handle_new_user (foundation schema) auto-creates the matching
  -- public.profiles row, email included — never inserted by hand.

  insert into public.platform_roles (profile_id, role)
  values (v_superadmin_user, 'superadmin');

  perform set_config('request.jwt.claim.sub', v_superadmin_user::text, true);

  -- ------------------------------------------------------------
  -- Call the 22-argument overload directly (named args force PostgREST/
  -- Postgres to resolve this exact overload, same as the real onboarding
  -- client always does) with is_dentist = true — a founder who also
  -- practices, the exact case this migration fixes.
  -- ------------------------------------------------------------
  select b.clinic_id, b.slug, b.location_id, b.membership_id, b.professional_profile_id
  into v_clinic_id, v_slug, v_location_id, v_membership_id, v_professional_profile_id
  from public.bootstrap_clinic(
    clinic_name := 'QA Bootstrap 22-arg Test Clinic',
    clinic_slug := 'qa-bootstrap-22arg-test-clinic',
    is_dentist := true,
    license_number := 'QA-12345',
    default_appointment_duration_minutes := 30,
    location_latitude := 4.710989,
    location_longitude := -74.072092
  ) as b;

  if v_professional_profile_id is null then
    raise exception 'FAILED: bootstrap_clinic (22-arg, is_dentist=true) did not return a professional_profile_id';
  end if;

  -- ------------------------------------------------------------
  -- THE FIX: 5 rows, Lunes-Viernes, 08:00-17:00, active — identical
  -- assertions to seed_default_professional_availability.test.sql's own
  -- Case 1+2+3, now exercised through the 22-argument overload's real
  -- founder-dentist path instead of calling the seed helper directly.
  -- ------------------------------------------------------------
  select count(*) into v_count
  from public.professional_availability
  where professional_profile_id = v_professional_profile_id;
  if v_count <> 5 then
    raise exception 'FAILED: expected exactly 5 availability rows for the 22-arg founder dentist, got %', v_count;
  end if;

  select array_agg(day_of_week order by day_of_week) into v_days
  from public.professional_availability
  where professional_profile_id = v_professional_profile_id;
  if v_days <> array[1,2,3,4,5]::smallint[] then
    raise exception 'FAILED: expected day_of_week 1..5 (Lunes..Viernes), got %', v_days;
  end if;

  for v_row in
    select * from public.professional_availability where professional_profile_id = v_professional_profile_id
  loop
    if v_row.start_time <> time '08:00' or v_row.end_time <> time '17:00' or v_row.active <> true then
      raise exception 'FAILED: day % is % - % (active=%), expected 08:00-17:00 active', v_row.day_of_week, v_row.start_time, v_row.end_time, v_row.active;
    end if;
    if v_row.clinic_id <> v_clinic_id then
      raise exception 'FAILED: day % has wrong clinic_id %', v_row.day_of_week, v_row.clinic_id;
    end if;
  end loop;

  raise notice 'OK: bootstrap_clinic (22-arg, is_dentist=true) seeds 5 rows, Lunes-Viernes, 08:00-17:00, active, correct clinic_id — same as the 20-arg overload';
end;
$$;

rollback;
