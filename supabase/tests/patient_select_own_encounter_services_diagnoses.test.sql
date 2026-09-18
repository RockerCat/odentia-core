-- Odentia Core — SQL-layer regression test for Master "consolidar
-- Servicios realizados": the additive patient-self-read RLS policies on
-- encounter_diagnoses/encounter_services
-- (20260918100000_patient_select_own_encounter_services_diagnoses.sql).
--
-- Same conventions as supabase/tests/patient_access_invitation.test.sql
-- and supabase/tests/confirm_clinic_specialty_rips_service.test.sql: a
-- plain psql script (no pgTAP), meant to run against a local Supabase
-- Postgres (`supabase start` + `supabase db reset`) — NOT against the
-- shared dev/prod project, and NOT executed as part of this change (no
-- local Postgres/docker available in this environment — see this task's
-- own final report; reported as NOT EXECUTED, never a false PASS).
-- Everything below runs inside one transaction that is always rolled
-- back at the end: safe to run repeatedly, never leaves fixture rows
-- (including the auth.users ones) behind.
--
-- Unlike those two prior tests (which exercise a SECURITY DEFINER RPC —
-- no role switch needed, since the function runs with the definer's own
-- privileges), this one exercises a RAW TABLE RLS POLICY directly, so it
-- deliberately DOES switch to the real `authenticated` role
-- (`set local role authenticated`) before every read assertion — running
-- as the default connecting role (superuser locally) would bypass RLS
-- entirely and silently prove nothing. `reset role` returns to the
-- privileged role for fixture setup between cases. `set_config('request.jwt.claim.sub', ...)`
-- alone (no role switch) is still correct for the one RPC call used to
-- build the fixture (accept_patient_access_invitation, SECURITY DEFINER,
-- same convention as patient_access_invitation.test.sql).

begin;

do $$
declare
  v_clinic_a uuid;
  v_clinic_b uuid;
  v_admin_a_user uuid;
  v_admin_b_user uuid;
  v_patient_x_user uuid;
  v_patient_y_user uuid;
  v_patient_z_user uuid;
  v_patient_x uuid; -- Clinic A, linked to v_patient_x_user
  v_patient_y uuid; -- Clinic A, linked to v_patient_y_user
  v_patient_z uuid; -- Clinic B, linked to v_patient_z_user
  v_prof_a uuid;
  v_encounter_x_finalized uuid;
  v_encounter_x_draft uuid;
  v_encounter_y_finalized uuid;
  v_encounter_z_finalized uuid;
  v_token text;
  v_count integer;
  v_failed boolean;
begin
  -- ------------------------------------------------------------
  -- Fixture: Clinic A (patient_x, patient_y — both linked Patients, each
  -- with one FINALIZED encounter carrying real encounter_diagnoses/
  -- encounter_services rows; patient_x additionally has a DRAFT encounter
  -- to prove the finalized_at gate) + Clinic B (patient_z, her own
  -- finalized encounter) for tenant isolation.
  -- ------------------------------------------------------------
  v_admin_a_user := gen_random_uuid();
  v_admin_b_user := gen_random_uuid();
  v_patient_x_user := gen_random_uuid();
  v_patient_y_user := gen_random_uuid();
  v_patient_z_user := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    ('00000000-0000-0000-0000-000000000000', v_admin_a_user, 'authenticated', 'authenticated',
     'admin-a@qa-encounter-services-rls-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_admin_b_user, 'authenticated', 'authenticated',
     'admin-b@qa-encounter-services-rls-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_patient_x_user, 'authenticated', 'authenticated',
     'patient-x@qa-encounter-services-rls-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_patient_y_user, 'authenticated', 'authenticated',
     'patient-y@qa-encounter-services-rls-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_patient_z_user, 'authenticated', 'authenticated',
     'patient-z@qa-encounter-services-rls-test.local', 'x', now(), now(), now(), '{}', '{}');
  -- handle_new_user (foundation schema) auto-creates the matching
  -- public.profiles row for each, email included.

  insert into public.clinics (name, slug) values ('QA Encounter Services RLS Test Clinic A', 'qa-enc-svc-rls-test-a')
  returning id into v_clinic_a;
  insert into public.clinics (name, slug) values ('QA Encounter Services RLS Test Clinic B', 'qa-enc-svc-rls-test-b')
  returning id into v_clinic_b;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_admin_a_user, 'clinic_admin', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_b, v_admin_b_user, 'clinic_admin', 'active', now());

  insert into public.professional_profiles (clinic_id, clinic_membership_id, document_type, document_number)
  select v_clinic_a, m.id, 'CC', '900000001'
  from public.clinic_memberships m
  where m.clinic_id = v_clinic_a and m.profile_id = v_admin_a_user
  returning id into v_prof_a;

  insert into public.patients (clinic_id, first_name, last_name) values (v_clinic_a, 'Xiomara', 'Test') returning id into v_patient_x;
  insert into public.patients (clinic_id, first_name, last_name) values (v_clinic_a, 'Yolanda', 'Test') returning id into v_patient_y;
  insert into public.patients (clinic_id, first_name, last_name) values (v_clinic_b, 'Zulma', 'Test') returning id into v_patient_z;

  -- Real link creation via the real RPCs (same convention as
  -- patient_access_invitation.test.sql) — never a hand-crafted
  -- patient_user_links row, so this fixture is only ever as valid as the
  -- real accept flow itself. create_patient_access_invitation requires an
  -- active clinic_admin/assistant OF THE PATIENT'S OWN CLINIC as the
  -- caller — impersonate the right admin before each call.
  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);
  select raw_token into v_token from public.create_patient_access_invitation(v_patient_x);
  perform set_config('request.jwt.claim.sub', v_patient_x_user::text, true);
  perform public.accept_patient_access_invitation(v_token);

  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);
  select raw_token into v_token from public.create_patient_access_invitation(v_patient_y);
  perform set_config('request.jwt.claim.sub', v_patient_y_user::text, true);
  perform public.accept_patient_access_invitation(v_token);

  perform set_config('request.jwt.claim.sub', v_admin_b_user::text, true);
  select raw_token into v_token from public.create_patient_access_invitation(v_patient_z);
  perform set_config('request.jwt.claim.sub', v_patient_z_user::text, true);
  perform public.accept_patient_access_invitation(v_token);

  perform set_config('request.jwt.claim.sub', '', true);

  -- Encounters + diagnoses/services, inserted directly (bypassing
  -- upsert_patient_clinical_encounter — irrelevant to this test, which is
  -- purely about the SELECT policy once rows already exist).
  insert into public.patient_clinical_encounters (clinic_id, patient_id, occurred_at, finalized_at)
  values (v_clinic_a, v_patient_x, now(), now())
  returning id into v_encounter_x_finalized;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, occurred_at, finalized_at)
  values (v_clinic_a, v_patient_x, now(), null) -- draft — never readable by the Patient
  returning id into v_encounter_x_draft;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, occurred_at, finalized_at)
  values (v_clinic_a, v_patient_y, now(), now())
  returning id into v_encounter_y_finalized;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, occurred_at, finalized_at)
  values (v_clinic_b, v_patient_z, now(), now())
  returning id into v_encounter_z_finalized;

  insert into public.encounter_diagnoses (encounter_id, clinic_id, cie10_code, role, sequence)
  values
    (v_encounter_x_finalized, v_clinic_a, 'K021', 'principal', 0),
    (v_encounter_x_draft, v_clinic_a, 'K021', 'principal', 0),
    (v_encounter_y_finalized, v_clinic_a, 'K050', 'principal', 0),
    (v_encounter_z_finalized, v_clinic_b, 'K046', 'principal', 0);

  insert into public.encounter_services (encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type)
  values
    (v_encounter_x_finalized, v_clinic_a, v_prof_a, '890201', 'consultation'),
    (v_encounter_x_draft, v_clinic_a, v_prof_a, '890201', 'consultation'),
    (v_encounter_y_finalized, v_clinic_a, v_prof_a, '890201', 'consultation'),
    (v_encounter_z_finalized, v_clinic_b, v_prof_a, '890201', 'consultation');

  raise notice 'Fixture ready: patient_x (Clinic A, 1 finalized + 1 draft encounter), patient_y (Clinic A, 1 finalized), patient_z (Clinic B, 1 finalized).';

  -- ------------------------------------------------------------
  -- Case 1: patient_x reads her OWN finalized encounter's diagnoses AND
  -- services — must see exactly 1 row each.
  -- ------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_patient_x_user::text, true);

  select count(*) into v_count from public.encounter_diagnoses where encounter_id = v_encounter_x_finalized;
  if v_count <> 1 then
    raise exception 'Case 1 FAILED: patient_x must see her own finalized encounter_diagnoses row, got count=%', v_count;
  end if;
  select count(*) into v_count from public.encounter_services where encounter_id = v_encounter_x_finalized;
  if v_count <> 1 then
    raise exception 'Case 1 FAILED: patient_x must see her own finalized encounter_services row, got count=%', v_count;
  end if;
  raise notice 'Case 1 OK: patient_x reads her own finalized diagnoses/services';

  -- ------------------------------------------------------------
  -- Case 2: patient_x can NEVER see her own DRAFT encounter's
  -- diagnoses/services — finalized_at is not null is baked into the
  -- policy itself.
  -- ------------------------------------------------------------
  select count(*) into v_count from public.encounter_diagnoses where encounter_id = v_encounter_x_draft;
  if v_count <> 0 then
    raise exception 'Case 2 FAILED: patient_x must NEVER see a draft encounter''s encounter_diagnoses, got count=%', v_count;
  end if;
  select count(*) into v_count from public.encounter_services where encounter_id = v_encounter_x_draft;
  if v_count <> 0 then
    raise exception 'Case 2 FAILED: patient_x must NEVER see a draft encounter''s encounter_services, got count=%', v_count;
  end if;
  raise notice 'Case 2 OK: draft (finalized_at null) encounter stays invisible even to its own patient';

  -- ------------------------------------------------------------
  -- Case 3: patient_x can NEVER see patient_y's rows, even though both
  -- are in the SAME clinic — cross-patient isolation within a clinic.
  -- ------------------------------------------------------------
  select count(*) into v_count from public.encounter_diagnoses where encounter_id = v_encounter_y_finalized;
  if v_count <> 0 then
    raise exception 'Case 3 FAILED: patient_x must NEVER see patient_y''s encounter_diagnoses, got count=%', v_count;
  end if;
  select count(*) into v_count from public.encounter_services where encounter_id = v_encounter_y_finalized;
  if v_count <> 0 then
    raise exception 'Case 3 FAILED: patient_x must NEVER see patient_y''s encounter_services, got count=%', v_count;
  end if;
  raise notice 'Case 3 OK: cross-patient isolation within the same clinic holds';

  -- ------------------------------------------------------------
  -- Case 4: patient_x can NEVER see patient_z's rows in a DIFFERENT
  -- clinic — cross-tenant isolation.
  -- ------------------------------------------------------------
  select count(*) into v_count from public.encounter_diagnoses where encounter_id = v_encounter_z_finalized;
  if v_count <> 0 then
    raise exception 'Case 4 FAILED: patient_x must NEVER see another clinic''s encounter_diagnoses, got count=%', v_count;
  end if;
  select count(*) into v_count from public.encounter_services where encounter_id = v_encounter_z_finalized;
  if v_count <> 0 then
    raise exception 'Case 4 FAILED: patient_x must NEVER see another clinic''s encounter_services, got count=%', v_count;
  end if;
  raise notice 'Case 4 OK: cross-clinic (cross-tenant) isolation holds';

  -- ------------------------------------------------------------
  -- Case 5: a full unscoped SELECT (no WHERE at all, as a buggy client
  -- query might issue) still returns ONLY patient_x's own 1 finalized
  -- row per table — RLS enforces isolation regardless of the query
  -- shape, never relying on the client to filter correctly.
  -- ------------------------------------------------------------
  select count(*) into v_count from public.encounter_diagnoses;
  if v_count <> 1 then
    raise exception 'Case 5 FAILED: an unfiltered SELECT must still return only patient_x''s own row (encounter_diagnoses), got count=%', v_count;
  end if;
  select count(*) into v_count from public.encounter_services;
  if v_count <> 1 then
    raise exception 'Case 5 FAILED: an unfiltered SELECT must still return only patient_x''s own row (encounter_services), got count=%', v_count;
  end if;
  raise notice 'Case 5 OK: RLS holds even for an unfiltered SELECT, never relying on client-side filtering';

  -- ------------------------------------------------------------
  -- Case 6: patient_x cannot INSERT into either table — no write
  -- policy/grant exists for this role on these tables at all (only
  -- `grant select ... to authenticated`), so this must fail closed with
  -- a permission error, never silently succeed.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    insert into public.encounter_diagnoses (encounter_id, clinic_id, cie10_code, role, sequence)
    values (v_encounter_x_finalized, v_clinic_a, 'K021', 'related', 1);
  exception
    when insufficient_privilege then
      v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 6 FAILED: patient_x must NEVER be able to INSERT into encounter_diagnoses';
  end if;

  v_failed := false;
  begin
    insert into public.encounter_services (encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type)
    values (v_encounter_x_finalized, v_clinic_a, v_prof_a, '890201', 'consultation');
  exception
    when insufficient_privilege then
      v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 6 FAILED: patient_x must NEVER be able to INSERT into encounter_services';
  end if;
  raise notice 'Case 6 OK: INSERT is rejected on both tables — read-only for the Patient, exactly as intended';

  -- ------------------------------------------------------------
  -- Case 7: patient_x cannot UPDATE/DELETE her own already-visible row
  -- either — SELECT-only, never a write escalation just because a row is
  -- readable.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    update public.encounter_services set cups_code = '999999' where encounter_id = v_encounter_x_finalized;
  exception
    when insufficient_privilege then
      v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 7 FAILED: patient_x must NEVER be able to UPDATE encounter_services';
  end if;

  v_failed := false;
  begin
    delete from public.encounter_services where encounter_id = v_encounter_x_finalized;
  exception
    when insufficient_privilege then
      v_failed := true;
  end;
  if not v_failed then
    raise exception 'Case 7 FAILED: patient_x must NEVER be able to DELETE from encounter_services';
  end if;
  raise notice 'Case 7 OK: UPDATE/DELETE rejected — read-only holds even for her own visible row';

  reset role;
  raise notice 'ALL CASES PASSED';
end;
$$;

rollback;
