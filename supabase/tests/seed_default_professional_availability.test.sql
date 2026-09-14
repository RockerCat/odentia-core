-- Odentia Core — SQL-layer regression test for
-- 20260914090000_seed_default_professional_availability.sql
--
-- This is a plain psql script (no pgTAP dependency — this repo has no
-- existing SQL test harness to plug into), meant to run against a local
-- Supabase Postgres (e.g. `supabase start` + `supabase db reset`) AFTER
-- the migration above has been reviewed and applied there. It is NOT run
-- against the shared dev/prod project, and was NOT executed as part of
-- this change (no local Postgres/docker available in the sandbox this was
-- written in — see the task's own final report).
--
-- Runs as the table owner (psql default role, e.g. `postgres`), so it
-- exercises seed_default_professional_availability() directly rather than
-- going through auth.uid()-gated RPCs — that keeps this test independent
-- of a real authenticated session while still covering every case that's
-- actually new logic. The three call sites (bootstrap_clinic,
-- accept_clinic_invitation, create_my_professional_profile) each just
-- call this same helper once, right after their own pre-existing
-- professional_profiles insert — reviewable by diff, not re-tested here
-- per call site.
--
-- Everything below runs inside one transaction that is always rolled
-- back at the end: safe to run repeatedly, never leaves fixture rows
-- behind.

begin;

do $$
declare
  v_clinic_id uuid;
  v_location_id uuid;
  v_membership_id uuid;
  v_profile_a uuid;
  v_profile_b uuid;
  v_clinic_id_b uuid;
  v_membership_id_b uuid;
  v_profile_c uuid;
  v_count integer;
  v_row record;
  v_days smallint[];
begin
  -- Minimal fixture: one clinic, one clinic_membership, two
  -- professional_profiles (A: fresh; B: will get a manually-configured
  -- schedule first, to test "already has availability").
  insert into public.clinics (name, slug) values ('QA Seed Test Clinic', 'qa-seed-test-clinic')
  returning id into v_clinic_id;

  insert into public.clinic_locations (clinic_id, name, is_primary, active)
  values (v_clinic_id, 'Sede principal', true, true)
  returning id into v_location_id;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_id, gen_random_uuid(), 'clinic_admin', 'active', now())
  returning id into v_membership_id;

  insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
  values (v_membership_id, v_clinic_id, true)
  returning id into v_profile_a;

  -- ------------------------------------------------------------
  -- Case 1 + 2: nuevo profesional -> 5 bloques L-V, cada uno 08:00-17:00.
  -- v_profile_a genuinely belongs to v_clinic_id, so this also doubles as
  -- "professional_profile perteneciente al clinic_id correcto -> seed
  -- permitido" (the new integrity check's happy path).
  -- ------------------------------------------------------------
  perform public.seed_default_professional_availability(v_profile_a, v_clinic_id);

  select count(*) into v_count
  from public.professional_availability
  where professional_profile_id = v_profile_a;
  if v_count <> 5 then
    raise exception 'Case 1 FAILED: expected exactly 5 rows, got %', v_count;
  end if;

  select array_agg(day_of_week order by day_of_week) into v_days
  from public.professional_availability
  where professional_profile_id = v_profile_a;
  if v_days <> array[1,2,3,4,5]::smallint[] then
    raise exception 'Case 1 FAILED: expected day_of_week 1..5 (Lunes..Viernes), got %', v_days;
  end if;

  for v_row in
    select * from public.professional_availability where professional_profile_id = v_profile_a
  loop
    if v_row.start_time <> time '08:00' or v_row.end_time <> time '17:00' or v_row.active <> true then
      raise exception 'Case 2 FAILED: day % is % - % (active=%), expected 08:00-17:00 active', v_row.day_of_week, v_row.start_time, v_row.end_time, v_row.active;
    end if;
    if v_row.clinic_id <> v_clinic_id then
      raise exception 'Case 2 FAILED: day % has wrong clinic_id %', v_row.day_of_week, v_row.clinic_id;
    end if;
  end loop;
  raise notice 'Case 1+2 OK: 5 rows, Lunes-Viernes, 08:00-17:00, active, correct clinic_id';

  -- ------------------------------------------------------------
  -- Case 3: sabado/domingo sin availability (no inactive placeholder rows).
  -- ------------------------------------------------------------
  select count(*) into v_count
  from public.professional_availability
  where professional_profile_id = v_profile_a and day_of_week in (6, 7);
  if v_count <> 0 then
    raise exception 'Case 3 FAILED: expected 0 rows for Sabado/Domingo, got %', v_count;
  end if;
  raise notice 'Case 3 OK: no rows for Sabado/Domingo';

  -- ------------------------------------------------------------
  -- Case 4: reintento del flujo no duplica filas.
  -- ------------------------------------------------------------
  perform public.seed_default_professional_availability(v_profile_a, v_clinic_id);
  perform public.seed_default_professional_availability(v_profile_a, v_clinic_id);

  select count(*) into v_count
  from public.professional_availability
  where professional_profile_id = v_profile_a;
  if v_count <> 5 then
    raise exception 'Case 4 FAILED: expected still 5 rows after 2 retries, got %', v_count;
  end if;
  raise notice 'Case 4 OK: retrying the seed call does not duplicate rows';

  -- ------------------------------------------------------------
  -- Case 5 + 6: profesional con availability preexistente (ya
  -- configurada, distinta del default) no recibe defaults y no se
  -- modifica lo ya configurado.
  -- ------------------------------------------------------------
  insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
  values (v_membership_id, v_clinic_id, true)
  returning id into v_profile_b;
  -- clinic_membership_id is only unique per real membership row via the
  -- accept/create RPCs' own guards, not enforced by a table constraint —
  -- fine for this isolated fixture, which never goes through those RPCs.

  insert into public.professional_availability (clinic_id, professional_profile_id, day_of_week, start_time, end_time, active)
  values (v_clinic_id, v_profile_b, 2, time '09:00', time '13:00', true);

  perform public.seed_default_professional_availability(v_profile_b, v_clinic_id);

  select count(*) into v_count
  from public.professional_availability
  where professional_profile_id = v_profile_b;
  if v_count <> 1 then
    raise exception 'Case 5 FAILED: expected still exactly 1 pre-existing row, got %', v_count;
  end if;

  select * into v_row
  from public.professional_availability
  where professional_profile_id = v_profile_b;
  if v_row.day_of_week <> 2 or v_row.start_time <> time '09:00' or v_row.end_time <> time '13:00' then
    raise exception 'Case 6 FAILED: pre-existing block was altered: day % % - %', v_row.day_of_week, v_row.start_time, v_row.end_time;
  end if;
  raise notice 'Case 5+6 OK: pre-existing availability blocks the default seed and is left untouched';

  -- ------------------------------------------------------------
  -- Case 7 (multi-tenant integrity): professional_profile real de
  -- Clinica B + clinic_id de Clinica A -> rechazado, ninguna fila
  -- insertada para ese profile.
  -- ------------------------------------------------------------
  insert into public.clinics (name, slug) values ('QA Seed Test Clinic B', 'qa-seed-test-clinic-b')
  returning id into v_clinic_id_b;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_id_b, gen_random_uuid(), 'clinic_admin', 'active', now())
  returning id into v_membership_id_b;

  insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
  values (v_membership_id_b, v_clinic_id_b, true)
  returning id into v_profile_c;

  begin
    perform public.seed_default_professional_availability(v_profile_c, v_clinic_id);
    raise exception 'Case 7 FAILED: expected an exception for a cross-tenant (profile B / clinic A) mismatch, none was raised';
  exception
    when sqlstate '42501' then
      raise notice 'Case 7 OK: cross-tenant mismatch (profile de Clinica B, clinic_id de Clinica A) is rejected (%)', sqlerrm;
    when others then
      raise exception 'Case 7 FAILED: unexpected error instead of the integrity check: %', sqlerrm;
  end;

  select count(*) into v_count
  from public.professional_availability
  where professional_profile_id = v_profile_c;
  if v_count <> 0 then
    raise exception 'Case 7 FAILED: a rejected call must not insert any row, got %', v_count;
  end if;

  -- ------------------------------------------------------------
  -- Case 8 (multi-tenant integrity): professional_profile_id inexistente
  -- -> rechazado.
  -- ------------------------------------------------------------
  begin
    perform public.seed_default_professional_availability(gen_random_uuid(), v_clinic_id);
    raise exception 'Case 8 FAILED: expected an exception for a non-existent professional_profile_id, none was raised';
  exception
    when sqlstate '42501' then
      raise notice 'Case 8 OK: a non-existent professional_profile_id is rejected (%)', sqlerrm;
    when others then
      raise exception 'Case 8 FAILED: unexpected error instead of the integrity check: %', sqlerrm;
  end;

  raise notice 'ALL CASES PASSED';
end;
$$;

rollback;

-- Two remaining cases from the original 8-case list are not re-tested
-- here as separate SQL assertions: "nuevo profesional sigue
-- visible/utilizable en Agenda usando esos horarios" falls directly out of
-- Cases 1-3 above plus the unchanged validate_appointment_availability()/
-- agenda-hours.ts slot logic (20260907160000), which already treats "has
-- rows -> respect them exactly" as its Case B, unmodified by this
-- migration. "No regresion en creacion/invitacion actual" is a
-- diff-reviewable guarantee: bootstrap_clinic/accept_clinic_invitation/
-- create_my_professional_profile are byte-identical to their prior
-- versions except for one added `perform` call after each function's own
-- pre-existing professional_profiles insert, inside the same transaction —
-- no existing validation/branch/return shape was touched, and none of the
-- three passes anything but its own just-inserted professional_profiles
-- row's own (id, clinic_id) pair, so the new integrity check in
-- seed_default_professional_availability() can never reject a call coming
-- from any of them.
