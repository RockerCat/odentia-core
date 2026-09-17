-- Odentia Core — SQL-layer regression test for "RIPS Fase A4B" —
-- apply_confirmed_specialty_rips_service_to_encounter() and its audit
-- table encounter_service_rips_corrections
-- (20260917110000_create_apply_confirmed_specialty_rips_service_rpc.sql).
--
-- Same conventions as the other supabase/tests/*.test.sql files in this
-- repo: a plain psql script (no pgTAP), meant to run against a local
-- Supabase Postgres (`supabase start` + `supabase db reset`) — NOT
-- against the shared dev/prod project, and NOT executed as part of this
-- change (no local Postgres/docker available in this environment — see
-- this task's own final report; reported as NOT RUN, never a false
-- PASS). Impersonates real users via set_config('request.jwt.claim.sub',
-- ...) to exercise the auth.uid()-gated SECURITY DEFINER function from
-- plain SQL. Everything below runs inside one transaction that is always
-- rolled back at the end: safe to run repeatedly, never leaves fixture
-- rows behind.
--
-- Fixture catalog/specialty/concept data is deliberately fake/obviously-QA
-- (codes and names prefixed 'QA-'), under its own dedicated
-- rips_catalog_imports row — this test never depends on or mutates the
-- real imported RIPS catalogs or any specialty already seeded in a real
-- target database.

begin;

do $$
declare
  v_import_id uuid;
  v_grupo_id uuid;
  v_servicio_id uuid;
  v_servicio_stale_id uuid; -- confirmed, but its own catalog row later goes inactive
  v_concept_id uuid;
  v_admin_a_user uuid;
  v_admin_b_user uuid;
  v_dentist_a_user uuid;
  v_clinic_a uuid;
  v_clinic_b uuid;
  v_membership_dentist_a uuid;
  v_professional_a uuid;
  v_specialty_1 uuid; -- confirmed institutional config exists
  v_specialty_2 uuid; -- only a GLOBAL default exists, never confirmed — must never be used
  v_specialty_3 uuid; -- confirmed, but the confirmed Servicio later goes inactive
  v_patient_1 uuid;
  v_encounter_1 uuid; -- finalized, 2 eligible services + 1 already-configured + 1 manual-CUPS
  v_encounter_2 uuid; -- NOT finalized
  v_encounter_3 uuid; -- finalized, specialty_2 (no confirmed config, only a global default)
  v_encounter_4 uuid; -- finalized, specialty_3 (confirmed config whose Servicio is now inactive)
  v_encounter_5 uuid; -- finalized, Case B success (existing Grupo matches derived Grupo)
  v_encounter_6 uuid; -- finalized, Case B conflict (existing Grupo differs) + a clean sibling service
  v_service_1 uuid;
  v_service_2 uuid;
  v_service_already_configured uuid;
  v_service_manual_cups uuid;
  v_service_not_finalized uuid;
  v_service_no_confirmed_config uuid;
  v_service_stale_config uuid;
  v_service_case_b_match uuid;
  v_service_case_b_conflict uuid;
  v_service_case_b_sibling_clean uuid;
  v_row record;
  v_count integer;
  v_failed boolean;
begin
  -- ------------------------------------------------------------
  -- Fixture: fake catalog data.
  -- ------------------------------------------------------------
  insert into public.rips_catalog_imports (catalog_key, version_label, valid_from, row_count, imported_by)
  values ('QA-TEST-A4B', 'qa-a4b', current_date, 0, 'test:apply_confirmed_specialty_rips_service_to_encounter')
  returning id into v_import_id;

  insert into public.rips_reference_values (import_id, catalog_key, code, label, version_label, valid_from, status)
  values (v_import_id, 'GrupoServicios', 'QA-GRP-A4B', 'QA Grupo A4B', 'qa-a4b', current_date, 'active')
  returning id into v_grupo_id;

  insert into public.rips_reference_values (import_id, catalog_key, code, label, parent_code, version_label, valid_from, status)
  values (v_import_id, 'Servicios', 'QA-SVC-A4B', 'QA Servicio A4B', 'QA-GRP-A4B', 'qa-a4b', current_date, 'active')
  returning id into v_servicio_id;

  -- A second Servicio, ACTIVE for now — will be flipped to 'superseded'
  -- further below, AFTER it's already confirmed for specialty_3, to
  -- simulate "confirmed, then the catalog moved on".
  insert into public.rips_reference_values (import_id, catalog_key, code, label, parent_code, version_label, valid_from, status)
  values (v_import_id, 'Servicios', 'QA-SVC-A4B-STALE', 'QA Servicio A4B Stale', 'QA-GRP-A4B', 'qa-a4b', current_date, 'active')
  returning id into v_servicio_stale_id;

  insert into public.clinical_concepts (slug, name)
  values ('qa_a4b_concept', 'QA Concepto A4B')
  returning id into v_concept_id;

  -- ------------------------------------------------------------
  -- Fixture: two clinics, users, one professional (dentist_a) in clinic A.
  -- ------------------------------------------------------------
  v_admin_a_user := gen_random_uuid();
  v_admin_b_user := gen_random_uuid();
  v_dentist_a_user := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    ('00000000-0000-0000-0000-000000000000', v_admin_a_user, 'authenticated', 'authenticated',
     'admin-a@qa-a4b-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_admin_b_user, 'authenticated', 'authenticated',
     'admin-b@qa-a4b-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_dentist_a_user, 'authenticated', 'authenticated',
     'dentist-a@qa-a4b-test.local', 'x', now(), now(), now(), '{}', '{}');

  insert into public.clinics (name, slug) values ('QA A4B Test Clinic A', 'qa-a4b-test-clinic-a') returning id into v_clinic_a;
  insert into public.clinics (name, slug) values ('QA A4B Test Clinic B', 'qa-a4b-test-clinic-b') returning id into v_clinic_b;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_admin_a_user, 'clinic_admin', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_b, v_admin_b_user, 'clinic_admin', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_dentist_a_user, 'dentist', 'active', now())
  returning id into v_membership_dentist_a;

  insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
  values (v_membership_dentist_a, v_clinic_a, true)
  returning id into v_professional_a;

  insert into public.specialties (name) values ('QA A4B Especialidad Uno') returning id into v_specialty_1;
  insert into public.specialties (name) values ('QA A4B Especialidad Dos') returning id into v_specialty_2;
  insert into public.specialties (name) values ('QA A4B Especialidad Tres') returning id into v_specialty_3;

  update public.professional_profiles set primary_specialty_id = v_specialty_1 where id = v_professional_a;

  insert into public.patients (clinic_id, first_name, last_name) values (v_clinic_a, 'QA', 'Paciente A4B') returning id into v_patient_1;

  -- ------------------------------------------------------------
  -- Institutional configuration: specialty_1 CONFIRMED (the real path —
  -- via confirm_clinic_specialty_rips_service itself, not a hand-built
  -- row). specialty_2 deliberately has ONLY a global suggestion, never
  -- confirmed. specialty_3 is confirmed against the "stale" Servicio,
  -- which is flipped to inactive AFTER confirming it.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);
  perform public.confirm_clinic_specialty_rips_service(v_specialty_1, v_servicio_id);
  perform public.confirm_clinic_specialty_rips_service(v_specialty_3, v_servicio_stale_id);

  -- Global suggestion for specialty_2 — must NEVER be read by the RPC
  -- under test; specialty_2 has no clinic_specialty_rips_services row at
  -- all.
  insert into public.specialty_rips_service_defaults (specialty_id, rips_reference_value_id)
  values (v_specialty_2, v_servicio_id);

  -- Now make specialty_3's own confirmed Servicio inactive in the
  -- catalog — simulating "it was confirmed, then superseded later".
  update public.rips_reference_values set status = 'superseded' where id = v_servicio_stale_id;

  -- ------------------------------------------------------------
  -- Encounters + services.
  -- ------------------------------------------------------------
  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_1, now()) returning id into v_encounter_1;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_1, null) returning id into v_encounter_2;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_1, now()) returning id into v_encounter_3;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_1, now()) returning id into v_encounter_4;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_1, now()) returning id into v_encounter_5;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_1, now()) returning id into v_encounter_6;

  -- encounter_1: two eligible services (same encounter -> same
  -- professional -> same specialty, per the no-co-atención model), one
  -- already-configured service, one manual-CUPS (no clinical concept).
  insert into public.encounter_services (
    encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type,
    clinical_concept_id, clinical_concept_name_snapshot, mapping_status
  ) values (
    v_encounter_1, v_clinic_a, v_professional_a, '890222', 'consultation',
    v_concept_id, 'QA Concepto A4B', 'resolved'
  ) returning id into v_service_1;

  insert into public.encounter_services (
    encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type,
    clinical_concept_id, clinical_concept_name_snapshot, mapping_status
  ) values (
    v_encounter_1, v_clinic_a, v_professional_a, '997001', 'procedure',
    v_concept_id, 'QA Concepto A4B', 'resolved'
  ) returning id into v_service_2;

  insert into public.encounter_services (
    encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type,
    clinical_concept_id, clinical_concept_name_snapshot, mapping_status,
    grupo_servicios_code, cod_servicio_code
  ) values (
    v_encounter_1, v_clinic_a, v_professional_a, '890301', 'consultation',
    v_concept_id, 'QA Concepto A4B', 'resolved',
    'PRE-EXISTING-GRP', 'PRE-EXISTING-SVC'
  ) returning id into v_service_already_configured;

  insert into public.encounter_services (
    encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type
  ) values (
    v_encounter_1, v_clinic_a, v_professional_a, '890201', 'consultation'
  ) returning id into v_service_manual_cups;

  -- encounter_2: NOT finalized — one eligible-shaped service, must never
  -- be touched.
  insert into public.encounter_services (
    encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type,
    clinical_concept_id, clinical_concept_name_snapshot, mapping_status
  ) values (
    v_encounter_2, v_clinic_a, v_professional_a, '890222', 'consultation',
    v_concept_id, 'QA Concepto A4B', 'resolved'
  ) returning id into v_service_not_finalized;

  -- encounter_5: Case B SUCCESS — grupo_servicios_code already frozen at
  -- exactly the Grupo the confirmed configuration (specialty_1 ->
  -- QA-GRP-A4B/QA-SVC-A4B) would derive; cod_servicio_code still null.
  -- Must complete ONLY cod_servicio_code, preserving the existing Grupo.
  insert into public.encounter_services (
    encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type,
    clinical_concept_id, clinical_concept_name_snapshot, mapping_status,
    grupo_servicios_code
  ) values (
    v_encounter_5, v_clinic_a, v_professional_a, '890222', 'consultation',
    v_concept_id, 'QA Concepto A4B', 'resolved',
    'QA-GRP-A4B'
  ) returning id into v_service_case_b_match;

  -- encounter_6: Case B CONFLICT — grupo_servicios_code frozen at a
  -- DIFFERENT value than the confirmed configuration would derive — plus
  -- a clean, otherwise-eligible sibling service (same encounter, same
  -- professional/specialty) that would succeed entirely on its own. Tests
  -- both the conflict rejection AND whole-encounter atomicity: the clean
  -- sibling must NOT end up corrected either.
  insert into public.encounter_services (
    encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type,
    clinical_concept_id, clinical_concept_name_snapshot, mapping_status
  ) values (
    v_encounter_6, v_clinic_a, v_professional_a, '890222', 'consultation',
    v_concept_id, 'QA Concepto A4B', 'resolved'
  ) returning id into v_service_case_b_sibling_clean;

  insert into public.encounter_services (
    encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type,
    clinical_concept_id, clinical_concept_name_snapshot, mapping_status,
    grupo_servicios_code
  ) values (
    v_encounter_6, v_clinic_a, v_professional_a, '997001', 'procedure',
    v_concept_id, 'QA Concepto A4B', 'resolved',
    'QA-GRP-CONFLICTING'
  ) returning id into v_service_case_b_conflict;

  -- encounter_3: specialty_2, no confirmed config (only a global default)
  -- — professional needs its OWN professional_profile with
  -- primary_specialty_id = specialty_2, reusing the same clinic
  -- membership is not possible (professional_profiles.clinic_membership_id
  -- is unique) — insert a second membership/profile for this case.
  declare
    v_membership_dentist_a2 uuid;
    v_professional_a2 uuid;
    v_membership_dentist_a3 uuid;
    v_professional_a3 uuid;
    v_dentist_a2_user uuid := gen_random_uuid();
    v_dentist_a3_user uuid := gen_random_uuid();
  begin
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) values
      ('00000000-0000-0000-0000-000000000000', v_dentist_a2_user, 'authenticated', 'authenticated',
       'dentist-a2@qa-a4b-test.local', 'x', now(), now(), now(), '{}', '{}'),
      ('00000000-0000-0000-0000-000000000000', v_dentist_a3_user, 'authenticated', 'authenticated',
       'dentist-a3@qa-a4b-test.local', 'x', now(), now(), now(), '{}', '{}');

    insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
    values (v_clinic_a, v_dentist_a2_user, 'dentist', 'active', now()) returning id into v_membership_dentist_a2;
    insert into public.professional_profiles (clinic_membership_id, clinic_id, primary_specialty_id, active)
    values (v_membership_dentist_a2, v_clinic_a, v_specialty_2, true) returning id into v_professional_a2;

    insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
    values (v_clinic_a, v_dentist_a3_user, 'dentist', 'active', now()) returning id into v_membership_dentist_a3;
    insert into public.professional_profiles (clinic_membership_id, clinic_id, primary_specialty_id, active)
    values (v_membership_dentist_a3, v_clinic_a, v_specialty_3, true) returning id into v_professional_a3;

    insert into public.encounter_services (
      encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type,
      clinical_concept_id, clinical_concept_name_snapshot, mapping_status
    ) values (
      v_encounter_3, v_clinic_a, v_professional_a2, '890222', 'consultation',
      v_concept_id, 'QA Concepto A4B', 'resolved'
    ) returning id into v_service_no_confirmed_config;

    insert into public.encounter_services (
      encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type,
      clinical_concept_id, clinical_concept_name_snapshot, mapping_status
    ) values (
      v_encounter_4, v_clinic_a, v_professional_a3, '890222', 'consultation',
      v_concept_id, 'QA Concepto A4B', 'resolved'
    ) returning id into v_service_stale_config;
  end;

  -- ------------------------------------------------------------
  -- Case: a non-admin (dentist) cannot call the RPC — nothing changes.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dentist_a_user::text, true);
  v_failed := false;
  begin
    perform public.apply_confirmed_specialty_rips_service_to_encounter(v_encounter_1);
  exception
    when sqlstate '42501' then v_failed := true;
    when others then raise exception 'Case FAILED (non-admin): unexpected error: %', sqlerrm;
  end;
  if not v_failed then raise exception 'Case FAILED: expected 42501 for a non-admin'; end if;

  perform 1 from public.encounter_services where id = v_service_1 and cod_servicio_code is null;
  if not found then raise exception 'Case FAILED (non-admin): service_1 must remain uncorrected'; end if;
  raise notice 'Case OK: a non-admin (dentist) cannot apply the correction, nothing changed';

  -- ------------------------------------------------------------
  -- Case: cross-clinic admin (admin_b) cannot correct clinic A's encounter.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_b_user::text, true);
  v_failed := false;
  begin
    perform public.apply_confirmed_specialty_rips_service_to_encounter(v_encounter_1);
  exception
    when sqlstate '42501' then v_failed := true;
    when others then raise exception 'Case FAILED (cross-clinic): unexpected error: %', sqlerrm;
  end;
  if not v_failed then raise exception 'Case FAILED: expected 42501 for a cross-clinic admin'; end if;
  raise notice 'Case OK: cross-clinic admin cannot correct another clinic''s encounter';

  -- ------------------------------------------------------------
  -- Case: encounter not finalized is rejected — nothing changes.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);
  v_failed := false;
  begin
    perform public.apply_confirmed_specialty_rips_service_to_encounter(v_encounter_2);
  exception
    when others then
      v_failed := sqlerrm like '%finalized%';
      if not v_failed then raise exception 'Case FAILED (not finalized): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a non-finalized encounter'; end if;

  perform 1 from public.encounter_services where id = v_service_not_finalized and cod_servicio_code is null;
  if not found then raise exception 'Case FAILED (not finalized): service must remain uncorrected'; end if;
  raise notice 'Case OK: a non-finalized encounter is rejected, nothing changed';

  -- ------------------------------------------------------------
  -- Case B SUCCESS: existing Grupo matches the confirmed configuration's
  -- own derived Grupo — only Servicio is completed, existing Grupo is
  -- preserved (re-written as the identical value), audit row reflects
  -- previous = new for Grupo and previous null / new confirmed for
  -- Servicio.
  -- ------------------------------------------------------------
  select * into v_row from public.apply_confirmed_specialty_rips_service_to_encounter(v_encounter_5);
  if v_row.updated_count <> 1 or not (v_service_case_b_match = any(v_row.updated_service_ids)) then
    raise exception 'Case FAILED (Case B success): expected exactly service_case_b_match updated, got count=%, ids=%', v_row.updated_count, v_row.updated_service_ids;
  end if;

  perform 1 from public.encounter_services
  where id = v_service_case_b_match
    and grupo_servicios_code = 'QA-GRP-A4B'
    and cod_servicio_code = 'QA-SVC-A4B';
  if not found then raise exception 'Case FAILED (Case B success): Grupo must be preserved and Servicio must be completed'; end if;

  perform 1 from public.encounter_service_rips_corrections
  where encounter_service_id = v_service_case_b_match
    and previous_grupo_servicios_code = 'QA-GRP-A4B' and new_grupo_servicios_code = 'QA-GRP-A4B'
    and previous_cod_servicio_code is null and new_cod_servicio_code = 'QA-SVC-A4B';
  if not found then raise exception 'Case FAILED (Case B success): audit row must record previous=new for Grupo and previous=null/new=confirmed for Servicio'; end if;
  raise notice 'Case OK: Case B success — existing correct Grupo is preserved, only Servicio is completed, audit row is accurate';

  -- ------------------------------------------------------------
  -- Case B CONFLICT + atomicity: existing Grupo DIFFERS from the one the
  -- confirmed configuration would derive — must fail closed, and must
  -- never partially correct the encounter's other, otherwise-eligible
  -- (clean) service either.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.apply_confirmed_specialty_rips_service_to_encounter(v_encounter_6);
  exception
    when others then
      v_failed := sqlerrm like '%does not match the Grupo%';
      if not v_failed then raise exception 'Case FAILED (Case B conflict): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a Grupo conflict'; end if;

  perform 1 from public.encounter_services
  where id = v_service_case_b_conflict and grupo_servicios_code = 'QA-GRP-CONFLICTING' and cod_servicio_code is null;
  if not found then raise exception 'Case FAILED (Case B conflict): the conflicting service must remain exactly as it was'; end if;

  perform 1 from public.encounter_services
  where id = v_service_case_b_sibling_clean and grupo_servicios_code is null and cod_servicio_code is null;
  if not found then
    raise exception 'Case FAILED (atomicity): the clean sibling service in the SAME encounter must NOT be corrected when another service in the same call conflicts';
  end if;

  perform 1 from public.encounter_service_rips_corrections
  where encounter_service_id in (v_service_case_b_conflict, v_service_case_b_sibling_clean);
  if found then raise exception 'Case FAILED (atomicity): no audit row may exist for either service of a rejected, rolled-back call'; end if;
  raise notice 'Case OK: Case B conflict fails closed, and the whole encounter''s correction is atomic — no partial update, no partial audit row';

  -- ------------------------------------------------------------
  -- Case: specialty with NO confirmed config (only a global default) —
  -- must fail closed, never fall back to specialty_rips_service_defaults.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.apply_confirmed_specialty_rips_service_to_encounter(v_encounter_3);
  exception
    when others then
      v_failed := sqlerrm like '%no confirmed and active Servicio RIPS%';
      if not v_failed then raise exception 'Case FAILED (no confirmed config): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection when no confirmed config exists'; end if;

  perform 1 from public.encounter_services where id = v_service_no_confirmed_config and cod_servicio_code is null;
  if not found then raise exception 'Case FAILED (no confirmed config): service must remain uncorrected — global default must never apply'; end if;
  raise notice 'Case OK: a specialty with only a global default (never confirmed) is rejected, never used as fallback';

  -- ------------------------------------------------------------
  -- Case: confirmed config whose own Servicio is now inactive in the
  -- catalog — must fail closed (stale confirmation is re-validated, not
  -- trusted blindly).
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.apply_confirmed_specialty_rips_service_to_encounter(v_encounter_4);
  exception
    when others then
      v_failed := sqlerrm like '%no confirmed and active Servicio RIPS%';
      if not v_failed then raise exception 'Case FAILED (stale config): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a now-inactive confirmed Servicio'; end if;

  perform 1 from public.encounter_services where id = v_service_stale_config and cod_servicio_code is null;
  if not found then raise exception 'Case FAILED (stale config): service must remain uncorrected'; end if;
  raise notice 'Case OK: a confirmed-but-now-inactive Servicio is re-validated and rejected, never applied blindly';

  -- ------------------------------------------------------------
  -- Case: the real success path — clinic_admin corrects BOTH eligible
  -- services of encounter_1 in one call, leaves the already-configured
  -- and manual-CUPS rows untouched, writes one audit row per corrected
  -- service, and never touches clinical columns.
  -- ------------------------------------------------------------
  select * into v_row from public.apply_confirmed_specialty_rips_service_to_encounter(v_encounter_1);
  if v_row.updated_count <> 2 then
    raise exception 'Case FAILED (success): expected updated_count = 2, got %', v_row.updated_count;
  end if;
  if not (v_service_1 = any(v_row.updated_service_ids) and v_service_2 = any(v_row.updated_service_ids)) then
    raise exception 'Case FAILED (success): updated_service_ids must include both eligible services, got %', v_row.updated_service_ids;
  end if;

  perform 1 from public.encounter_services
  where id in (v_service_1, v_service_2)
    and grupo_servicios_code = 'QA-GRP-A4B'
    and cod_servicio_code = 'QA-SVC-A4B';
  if not found then raise exception 'Case FAILED (success): both services must now carry the clinic''s confirmed Grupo/Servicio'; end if;

  perform 1 from public.encounter_services
  where id = v_service_already_configured
    and grupo_servicios_code = 'PRE-EXISTING-GRP' and cod_servicio_code = 'PRE-EXISTING-SVC';
  if not found then raise exception 'Case FAILED (success): an already-configured service must never be overwritten'; end if;

  perform 1 from public.encounter_services where id = v_service_manual_cups and cod_servicio_code is null and grupo_servicios_code is null;
  if not found then raise exception 'Case FAILED (success): a manual-CUPS (no clinical_concept_id) row must never be touched'; end if;

  -- Clinical columns intact.
  perform 1 from public.encounter_services
  where id = v_service_1 and cups_code = '890222' and rips_service_type = 'consultation'
    and clinical_concept_id = v_concept_id and clinical_concept_name_snapshot = 'QA Concepto A4B'
    and professional_profile_id = v_professional_a;
  if not found then raise exception 'Case FAILED (success): service_1''s clinical columns must remain exactly as they were'; end if;

  select count(*) into v_count from public.encounter_service_rips_corrections where encounter_service_id in (v_service_1, v_service_2);
  if v_count <> 2 then raise exception 'Case FAILED (success): expected exactly 2 audit rows, got %', v_count; end if;

  perform 1 from public.encounter_service_rips_corrections
  where encounter_service_id in (v_service_1, v_service_2)
    and clinic_id = v_clinic_a
    and previous_grupo_servicios_code is null and previous_cod_servicio_code is null
    and new_grupo_servicios_code = 'QA-GRP-A4B' and new_cod_servicio_code = 'QA-SVC-A4B'
    and corrected_by = v_admin_a_user
    and corrected_at is not null
  having count(*) = 2;
  if not found then raise exception 'Case FAILED (success): audit rows must record previous=null, new=confirmed values, correct actor/timestamp'; end if;

  raise notice 'Case OK: clinic_admin corrects both eligible services, leaves everything else untouched, writes 2 audit rows with correct actor/timestamp';

  -- ------------------------------------------------------------
  -- Case: second run on the same encounter is idempotent — nothing left
  -- to correct, no duplicate audit rows.
  -- ------------------------------------------------------------
  select * into v_row from public.apply_confirmed_specialty_rips_service_to_encounter(v_encounter_1);
  if v_row.updated_count <> 0 then raise exception 'Case FAILED (idempotent): expected updated_count = 0 on a second run, got %', v_row.updated_count; end if;

  select count(*) into v_count from public.encounter_service_rips_corrections where encounter_service_id in (v_service_1, v_service_2);
  if v_count <> 2 then raise exception 'Case FAILED (idempotent): a second run must never create duplicate audit rows, got % total', v_count; end if;
  raise notice 'Case OK: a second run on an already-corrected encounter is a harmless no-op, no duplicate audit rows';

  raise notice 'ALL CASES PASSED';
end;
$$;

rollback;
