-- Odentia Core — SQL-layer regression test for
-- 20260921110000_create_add_missing_finalized_encounter_principal_diagnosis_rpc.sql
--
-- Same conventions as correct_encounter_service_rips_field.test.sql: a
-- plain psql script (no pgTAP), meant to run against a local Supabase
-- Postgres (`supabase start` + `supabase db reset`) AFTER this migration
-- has been reviewed and applied there — NOT against the shared dev/prod
-- project, and NOT executed as part of this change (no local
-- Postgres/Docker available in this sandbox — see the task's own final
-- report: NOT RUN locally).
--
-- add_missing_finalized_encounter_principal_diagnosis() resolves both
-- auth.uid() and is_active_clinical_professional() itself, so this test
-- impersonates real users via set_config('request.jwt.claim.sub', ...) —
-- same trick every other RPC-level test here already uses — backed by
-- real (if minimal) auth.users rows.
--
-- Runs inside one transaction, always rolled back at the end: safe to
-- run repeatedly, never leaves fixture rows (including the auth.users
-- ones) behind.

begin;

do $$
declare
  v_import_id uuid;
  v_clinic_a uuid;
  v_clinic_b uuid;
  v_dentist_a_user uuid;         -- dentist, clinic A — CAN correct
  v_admin_clinical_user uuid;    -- clinic_admin WITH active professional_profile — CAN correct
  v_admin_pure_user uuid;        -- clinic_admin with NO professional_profile — CANNOT correct
  v_assistant_a_user uuid;       -- assistant, clinic A — CANNOT correct
  v_dentist_b_user uuid;         -- dentist, clinic B (unrelated) — CANNOT correct clinic A's data
  v_membership_dentist_a uuid;
  v_membership_admin_clinical uuid;
  v_membership_dentist_b uuid;
  v_professional_dentist_a uuid;
  v_professional_admin_clinical uuid;
  v_professional_dentist_b uuid;
  v_patient_a uuid;
  v_encounter_finalized uuid;
  v_encounter_not_finalized uuid;
  v_encounter_with_related_only uuid;
  v_related_diagnosis_id uuid;
  v_result public.encounter_diagnoses;
  v_audit record;
  v_failed boolean;
  v_count integer;
begin
  -- ------------------------------------------------------------
  -- Fixture: real CIE10/RIPSTipoDiagnosticoPrincipalVersion2 catalog rows
  -- (this project imports these from CSV, not migrations — see
  -- docs/rips-catalogs.md — so a test must never assume real catalog
  -- data is present locally; same convention as every other RIPS test).
  -- ------------------------------------------------------------
  insert into public.rips_catalog_imports (catalog_key, version_label, valid_from, row_count, imported_by)
  values ('QA-TEST-PRINCIPAL-DX', 'qa-principal-dx', current_date, 0, 'test:add_missing_finalized_encounter_principal_diagnosis')
  returning id into v_import_id;

  insert into public.diagnosis_catalog (import_id, classification_system, code, version_label, description, valid_from, status)
  values (v_import_id, 'CIE10', 'Z012', 'qa-principal-dx', 'QA Examen odontologico', current_date, 'active');
  insert into public.diagnosis_catalog (import_id, classification_system, code, version_label, description, valid_from, status)
  values (v_import_id, 'CIE10', 'K021', 'qa-principal-dx', 'QA Caries de la dentina', current_date, 'active');

  insert into public.rips_reference_values (import_id, catalog_key, code, label, version_label, valid_from, status)
  values (v_import_id, 'RIPSTipoDiagnosticoPrincipalVersion2', '01', 'QA Impresion diagnostica', 'qa-principal-dx', current_date, 'active');

  -- ------------------------------------------------------------
  -- Fixture: two clinics, five real auth.users.
  -- ------------------------------------------------------------
  v_dentist_a_user := gen_random_uuid();
  v_admin_clinical_user := gen_random_uuid();
  v_admin_pure_user := gen_random_uuid();
  v_assistant_a_user := gen_random_uuid();
  v_dentist_b_user := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    ('00000000-0000-0000-0000-000000000000', v_dentist_a_user, 'authenticated', 'authenticated',
     'dentist-a@qa-principal-dx-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_admin_clinical_user, 'authenticated', 'authenticated',
     'admin-clinical@qa-principal-dx-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_admin_pure_user, 'authenticated', 'authenticated',
     'admin-pure@qa-principal-dx-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_assistant_a_user, 'authenticated', 'authenticated',
     'assistant-a@qa-principal-dx-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_dentist_b_user, 'authenticated', 'authenticated',
     'dentist-b@qa-principal-dx-test.local', 'x', now(), now(), now(), '{}', '{}');

  insert into public.clinics (name, slug) values ('QA Principal Dx Clinic A', 'qa-principal-dx-clinic-a') returning id into v_clinic_a;
  insert into public.clinics (name, slug) values ('QA Principal Dx Clinic B', 'qa-principal-dx-clinic-b') returning id into v_clinic_b;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_dentist_a_user, 'dentist', 'active', now())
  returning id into v_membership_dentist_a;
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_admin_clinical_user, 'clinic_admin', 'active', now())
  returning id into v_membership_admin_clinical;
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_admin_pure_user, 'clinic_admin', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_assistant_a_user, 'assistant', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_b, v_dentist_b_user, 'dentist', 'active', now())
  returning id into v_membership_dentist_b;

  -- admin_pure deliberately gets NO professional_profiles row — a plain
  -- administrative clinic_admin, the exact case this RPC must reject.
  insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
  values (v_membership_dentist_a, v_clinic_a, true)
  returning id into v_professional_dentist_a;
  insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
  values (v_membership_admin_clinical, v_clinic_a, true)
  returning id into v_professional_admin_clinical;
  insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
  values (v_membership_dentist_b, v_clinic_b, true)
  returning id into v_professional_dentist_b;

  insert into public.patients (clinic_id, first_name, last_name)
  values (v_clinic_a, 'QA', 'Paciente Principal Dx')
  returning id into v_patient_a;

  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_a, now())
  returning id into v_encounter_finalized;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_a, null)
  returning id into v_encounter_not_finalized;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_a, now())
  returning id into v_encounter_with_related_only;

  -- encounter_with_related_only already has a RELATED diagnosis (no
  -- principal) — used below to confirm the correction never touches an
  -- existing diagnosis of a different role.
  insert into public.encounter_diagnoses (encounter_id, clinic_id, cie10_code, role, sequence)
  values (v_encounter_with_related_only, v_clinic_a, 'K021', 'related', 0)
  returning id into v_related_diagnosis_id;

  -- ------------------------------------------------------------
  -- SAFETY — non-finalized encounter is rejected.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dentist_a_user::text, true);
  v_failed := false;
  begin
    perform public.add_missing_finalized_encounter_principal_diagnosis(v_encounter_not_finalized, 'Z012', '01');
  exception
    when others then
      v_failed := sqlerrm like '%finalized%';
      if not v_failed then raise exception 'Case FAILED (not finalized): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a non-finalized encounter'; end if;
  raise notice 'Case OK: a non-finalized encounter is rejected';

  -- ------------------------------------------------------------
  -- AUTHORIZATION — a purely administrative clinic_admin is rejected.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_pure_user::text, true);
  v_failed := false;
  begin
    perform public.add_missing_finalized_encounter_principal_diagnosis(v_encounter_finalized, 'Z012', '01');
  exception
    when sqlstate '42501' then v_failed := true;
    when others then raise exception 'Case FAILED (pure admin): unexpected error: %', sqlerrm;
  end;
  if not v_failed then raise exception 'Case FAILED: expected 42501 for a purely administrative clinic_admin'; end if;
  raise notice 'Case OK: a clinic_admin with no active professional_profile is rejected';

  -- ------------------------------------------------------------
  -- AUTHORIZATION — an assistant is rejected.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_assistant_a_user::text, true);
  v_failed := false;
  begin
    perform public.add_missing_finalized_encounter_principal_diagnosis(v_encounter_finalized, 'Z012', '01');
  exception
    when sqlstate '42501' then v_failed := true;
    when others then raise exception 'Case FAILED (assistant): unexpected error: %', sqlerrm;
  end;
  if not v_failed then raise exception 'Case FAILED: expected 42501 for an assistant'; end if;
  raise notice 'Case OK: an assistant is rejected';

  -- ------------------------------------------------------------
  -- AUTHORIZATION — a dentist of a DIFFERENT clinic is rejected.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dentist_b_user::text, true);
  v_failed := false;
  begin
    perform public.add_missing_finalized_encounter_principal_diagnosis(v_encounter_finalized, 'Z012', '01');
  exception
    when sqlstate '42501' then v_failed := true;
    when others then raise exception 'Case FAILED (cross-clinic dentist): unexpected error: %', sqlerrm;
  end;
  if not v_failed then raise exception 'Case FAILED: expected 42501 for a cross-clinic dentist'; end if;
  raise notice 'Case OK: a dentist of another clinic cannot correct clinic A''s data';

  -- ------------------------------------------------------------
  -- SAFETY — invalid CIE-10 code is rejected.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dentist_a_user::text, true);
  v_failed := false;
  begin
    perform public.add_missing_finalized_encounter_principal_diagnosis(v_encounter_finalized, 'QA-DOES-NOT-EXIST', '01');
  exception
    when others then
      v_failed := sqlerrm like '%CIE10 catalog%';
      if not v_failed then raise exception 'Case FAILED (bad CIE-10): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a nonexistent CIE-10 code'; end if;
  raise notice 'Case OK: an invalid CIE-10 code is rejected';

  -- ------------------------------------------------------------
  -- SAFETY — invalid diagnosis_type_code is rejected.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.add_missing_finalized_encounter_principal_diagnosis(v_encounter_finalized, 'Z012', '99');
  exception
    when others then
      v_failed := sqlerrm like '%RIPSTipoDiagnosticoPrincipalVersion2%';
      if not v_failed then raise exception 'Case FAILED (bad diagnosis type): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for an invalid diagnosis_type_code'; end if;
  raise notice 'Case OK: an invalid diagnosis_type_code is rejected';

  -- Confirm none of the rejected attempts above persisted anything.
  select count(*) into v_count from public.encounter_diagnoses where encounter_id = v_encounter_finalized;
  if v_count <> 0 then raise exception 'Case FAILED: a rejected attempt must never insert a row, found %', v_count; end if;

  -- ------------------------------------------------------------
  -- SUCCESS — active dentist adds the missing principal diagnosis.
  -- ------------------------------------------------------------
  v_result := public.add_missing_finalized_encounter_principal_diagnosis(v_encounter_finalized, 'Z012', '01');
  if v_result.cie10_code <> 'Z012' then raise exception 'Case FAILED: cie10_code not persisted (got %)', v_result.cie10_code; end if;
  if v_result.diagnosis_type_code <> '01' then raise exception 'Case FAILED: diagnosis_type_code not persisted'; end if;
  if v_result.role <> 'principal' then raise exception 'Case FAILED: role must be principal, got %', v_result.role; end if;
  if v_result.encounter_service_id is not null then raise exception 'Case FAILED: must be encounter-wide (encounter_service_id null)'; end if;

  select * into v_audit from public.encounter_principal_diagnosis_corrections where encounter_id = v_encounter_finalized;
  if v_audit.id is null then raise exception 'Case FAILED: no audit row created'; end if;
  if v_audit.corrected_by <> v_dentist_a_user then raise exception 'Case FAILED: audit corrected_by mismatch'; end if;
  if v_audit.encounter_diagnosis_id <> v_result.id then raise exception 'Case FAILED: audit encounter_diagnosis_id mismatch'; end if;
  if v_audit.cie10_code <> 'Z012' then raise exception 'Case FAILED: audit cie10_code mismatch'; end if;
  if v_audit.clinic_id <> v_clinic_a then raise exception 'Case FAILED: audit clinic_id mismatch'; end if;
  raise notice 'Case OK: active dentist adds the missing principal diagnosis, encounter-wide, audit row correct';

  -- ------------------------------------------------------------
  -- SAFETY — already has a principal now: reject a second attempt, even
  -- from an otherwise-authorized clinically-active clinic_admin.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_clinical_user::text, true);
  v_failed := false;
  begin
    perform public.add_missing_finalized_encounter_principal_diagnosis(v_encounter_finalized, 'K021', '02');
  exception
    when others then
      v_failed := sqlerrm like '%already has a principal diagnosis%';
      if not v_failed then raise exception 'Case FAILED (already has principal): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection when a principal already exists'; end if;

  select count(*) into v_count from public.encounter_diagnoses where encounter_id = v_encounter_finalized and role = 'principal';
  if v_count <> 1 then raise exception 'Case FAILED: expected exactly 1 principal, got %', v_count; end if;
  raise notice 'Case OK: a second attempt is rejected once a principal already exists, no overwrite';

  -- ------------------------------------------------------------
  -- SUCCESS + NO SIDE EFFECT — clinically-active clinic_admin adds a
  -- principal to a DIFFERENT encounter that already has an unrelated
  -- RELATED diagnosis; that existing row must stay completely untouched.
  -- ------------------------------------------------------------
  perform public.add_missing_finalized_encounter_principal_diagnosis(v_encounter_with_related_only, 'Z012', null);

  perform 1 from public.encounter_diagnoses
  where id = v_related_diagnosis_id and cie10_code = 'K021' and role = 'related' and sequence = 0;
  if not found then raise exception 'Case FAILED: pre-existing related diagnosis was modified'; end if;

  select count(*) into v_count from public.encounter_diagnoses where encounter_id = v_encounter_with_related_only;
  if v_count <> 2 then raise exception 'Case FAILED: expected exactly 2 rows (1 related + 1 new principal), got %', v_count; end if;
  raise notice 'Case OK: adding a principal never touches a pre-existing related diagnosis (diagnosis_type_code left null, never inferred)';

  raise notice 'ALL CASES PASSED';
end;
$$;

rollback;
