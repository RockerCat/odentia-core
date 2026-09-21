-- Odentia Core — SQL-layer regression test for
-- 20260921100000_create_correct_encounter_service_rips_field_rpc.sql
--
-- Same conventions as apply_confirmed_specialty_rips_service_to_encounter.test.sql/
-- regenerate_clinic_invitation.test.sql: a plain psql script (no pgTAP),
-- meant to run against a local Supabase Postgres (`supabase start` +
-- `supabase db reset`) AFTER this migration has been reviewed and applied
-- there — NOT against the shared dev/prod project, and NOT executed as
-- part of this change (no local Postgres/Docker available in this
-- sandbox — see the task's own final report: NOT RUN locally).
--
-- correct_encounter_service_rips_field() resolves both auth.uid() and
-- is_active_clinical_professional() itself, so this test impersonates
-- real users via set_config('request.jwt.claim.sub', ...) — same trick
-- every other RPC-level test here already uses — backed by real (if
-- minimal) auth.users rows.
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
  v_admin_clinical_user uuid;   -- clinic_admin WITH an active professional_profile — CAN correct
  v_admin_pure_user uuid;       -- clinic_admin with NO professional_profile — CANNOT correct
  v_dentist_a_user uuid;        -- dentist, clinic A — CAN correct
  v_assistant_a_user uuid;      -- assistant, clinic A — CANNOT correct
  v_dentist_b_user uuid;        -- dentist, clinic B (unrelated) — CANNOT correct clinic A's data
  v_membership_admin_clinical uuid;
  v_membership_dentist_a uuid;
  v_membership_dentist_b uuid;
  v_professional_admin_clinical uuid;
  v_professional_dentist_a uuid;
  v_professional_dentist_b uuid;
  v_patient_a uuid;
  v_encounter_finalized uuid;
  v_encounter_not_finalized uuid;
  v_service_consultation uuid;
  v_service_procedure uuid;
  v_service_extra uuid;
  v_row public.encounter_services;
  v_audit record;
  v_failed boolean;
begin
  -- ------------------------------------------------------------
  -- Fixture: real RIPSFinalidadConsultaVersion2/RIPSCausaExternaVersion2
  -- catalog rows (this project imports these from CSV, not migrations —
  -- see docs/rips-catalogs.md — so a test must never assume real catalog
  -- data is present locally; same convention as A4B's own test).
  -- ------------------------------------------------------------
  insert into public.rips_catalog_imports (catalog_key, version_label, valid_from, row_count, imported_by)
  values ('QA-TEST-FIELD-CORRECTION', 'qa-field-correction', current_date, 0, 'test:correct_encounter_service_rips_field')
  returning id into v_import_id;

  insert into public.rips_reference_values (import_id, catalog_key, code, label, version_label, valid_from, status)
  values (v_import_id, 'RIPSFinalidadConsultaVersion2', 'QA-FIN', 'QA Finalidad activa', 'qa-field-correction', current_date, 'active');
  insert into public.rips_reference_values (import_id, catalog_key, code, label, version_label, valid_from, status)
  values (v_import_id, 'RIPSCausaExternaVersion2', 'QA-CAU', 'QA Causa activa', 'qa-field-correction', current_date, 'active');
  -- Inactive code — must be rejected exactly like a nonexistent one.
  insert into public.rips_reference_values (import_id, catalog_key, code, label, version_label, valid_from, status)
  values (v_import_id, 'RIPSFinalidadConsultaVersion2', 'QA-OLD', 'QA Finalidad superseded', 'qa-field-correction', current_date, 'superseded');

  -- ------------------------------------------------------------
  -- Fixture: two clinics, five real auth.users (handle_new_user
  -- auto-creates each matching profiles row).
  -- ------------------------------------------------------------
  v_admin_clinical_user := gen_random_uuid();
  v_admin_pure_user := gen_random_uuid();
  v_dentist_a_user := gen_random_uuid();
  v_assistant_a_user := gen_random_uuid();
  v_dentist_b_user := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    ('00000000-0000-0000-0000-000000000000', v_admin_clinical_user, 'authenticated', 'authenticated',
     'admin-clinical@qa-field-correction-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_admin_pure_user, 'authenticated', 'authenticated',
     'admin-pure@qa-field-correction-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_dentist_a_user, 'authenticated', 'authenticated',
     'dentist-a@qa-field-correction-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_assistant_a_user, 'authenticated', 'authenticated',
     'assistant-a@qa-field-correction-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_dentist_b_user, 'authenticated', 'authenticated',
     'dentist-b@qa-field-correction-test.local', 'x', now(), now(), now(), '{}', '{}');

  insert into public.clinics (name, slug) values ('QA Field Correction Clinic A', 'qa-field-correction-clinic-a') returning id into v_clinic_a;
  insert into public.clinics (name, slug) values ('QA Field Correction Clinic B', 'qa-field-correction-clinic-b') returning id into v_clinic_b;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_admin_clinical_user, 'clinic_admin', 'active', now())
  returning id into v_membership_admin_clinical;
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_admin_pure_user, 'clinic_admin', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_dentist_a_user, 'dentist', 'active', now())
  returning id into v_membership_dentist_a;
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_assistant_a_user, 'assistant', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_b, v_dentist_b_user, 'dentist', 'active', now())
  returning id into v_membership_dentist_b;

  -- admin_pure deliberately gets NO professional_profiles row — a plain
  -- administrative clinic_admin, the exact case this RPC must reject.
  insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
  values (v_membership_admin_clinical, v_clinic_a, true)
  returning id into v_professional_admin_clinical;
  insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
  values (v_membership_dentist_a, v_clinic_a, true)
  returning id into v_professional_dentist_a;
  insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
  values (v_membership_dentist_b, v_clinic_b, true)
  returning id into v_professional_dentist_b;

  insert into public.patients (clinic_id, first_name, last_name)
  values (v_clinic_a, 'QA', 'Paciente Field Correction')
  returning id into v_patient_a;

  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_a, now())
  returning id into v_encounter_finalized;
  insert into public.patient_clinical_encounters (clinic_id, patient_id, finalized_at)
  values (v_clinic_a, v_patient_a, null)
  returning id into v_encounter_not_finalized;

  insert into public.encounter_services (encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type)
  values (v_encounter_finalized, v_clinic_a, v_professional_dentist_a, '890201', 'consultation')
  returning id into v_service_consultation;
  insert into public.encounter_services (encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type)
  values (v_encounter_finalized, v_clinic_a, v_professional_dentist_a, '997001', 'procedure')
  returning id into v_service_procedure;

  insert into public.encounter_services (encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type)
  values (v_encounter_not_finalized, v_clinic_a, v_professional_dentist_a, '890201', 'consultation');

  -- ------------------------------------------------------------
  -- SUCCESS — active dentist fills finalidad_code on a consultation.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dentist_a_user::text, true);
  v_row := public.correct_encounter_service_rips_field(v_service_consultation, 'finalidad_code', 'QA-FIN');
  if v_row.finalidad_code <> 'QA-FIN' then
    raise exception 'Case FAILED: finalidad_code was not persisted (got %)', v_row.finalidad_code;
  end if;

  select * into v_audit from public.encounter_service_rips_field_corrections
  where encounter_service_id = v_service_consultation and field = 'finalidad_code';
  if v_audit.id is null then raise exception 'Case FAILED: no audit row for finalidad_code correction'; end if;
  if v_audit.corrected_by <> v_dentist_a_user then raise exception 'Case FAILED: audit corrected_by mismatch'; end if;
  if v_audit.previous_value is not null then raise exception 'Case FAILED: audit previous_value should be null, got %', v_audit.previous_value; end if;
  if v_audit.new_value <> 'QA-FIN' then raise exception 'Case FAILED: audit new_value mismatch, got %', v_audit.new_value; end if;
  if v_audit.clinic_id <> v_clinic_a then raise exception 'Case FAILED: audit clinic_id mismatch'; end if;
  raise notice 'Case OK: active dentist fills finalidad_code, value persisted, audit row correct';

  -- ------------------------------------------------------------
  -- SUCCESS — same dentist fills causa_motivo_code on the same consulta.
  -- ------------------------------------------------------------
  v_row := public.correct_encounter_service_rips_field(v_service_consultation, 'causa_motivo_code', 'QA-CAU');
  if v_row.causa_motivo_code <> 'QA-CAU' then
    raise exception 'Case FAILED: causa_motivo_code was not persisted (got %)', v_row.causa_motivo_code;
  end if;
  perform 1 from public.encounter_service_rips_field_corrections
  where encounter_service_id = v_service_consultation and field = 'causa_motivo_code' and new_value = 'QA-CAU';
  if not found then raise exception 'Case FAILED: no audit row for causa_motivo_code correction'; end if;
  raise notice 'Case OK: causa_motivo_code filled, audit row correct';

  -- ------------------------------------------------------------
  -- SAFETY — invalid/nonexistent catalog code. Run BEFORE any success
  -- case ever fills v_service_procedure.finalidad_code, so this exercises
  -- the catalog check specifically (a currently-null field), not the
  -- separate "already set" guard.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.correct_encounter_service_rips_field(v_service_procedure, 'finalidad_code', 'QA-DOES-NOT-EXIST');
  exception
    when others then
      v_failed := sqlerrm like '%not an active code%';
      if not v_failed then raise exception 'Case FAILED (bad catalog code): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a nonexistent catalog code'; end if;
  perform 1 from public.encounter_services where id = v_service_procedure and finalidad_code is null;
  if not found then raise exception 'Case FAILED: a rejected catalog code must not persist anything'; end if;
  raise notice 'Case OK: a nonexistent catalog code is rejected, field remains null';

  -- ------------------------------------------------------------
  -- SAFETY — a real but SUPERSEDED (inactive) catalog code is rejected
  -- exactly like a nonexistent one. Same "before any success case"
  -- ordering — uses a fresh service, never v_service_procedure.
  -- ------------------------------------------------------------
  insert into public.encounter_services (encounter_id, clinic_id, professional_profile_id, cups_code, rips_service_type)
  values (v_encounter_finalized, v_clinic_a, v_professional_dentist_a, '890202', 'consultation')
  returning id into v_service_extra;

  v_failed := false;
  begin
    perform public.correct_encounter_service_rips_field(v_service_extra, 'finalidad_code', 'QA-OLD');
  exception
    when others then
      v_failed := sqlerrm like '%not an active code%';
      if not v_failed then raise exception 'Case FAILED (superseded catalog code): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a superseded (inactive) catalog code'; end if;
  raise notice 'Case OK: a superseded (inactive) catalog code is rejected exactly like a nonexistent one';

  -- ------------------------------------------------------------
  -- SUCCESS — clinically-active clinic_admin fills finalidad_code on a
  -- procedimiento (never causa — DT1 defines no such field there).
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_clinical_user::text, true);
  v_row := public.correct_encounter_service_rips_field(v_service_procedure, 'finalidad_code', 'QA-FIN');
  if v_row.finalidad_code <> 'QA-FIN' then raise exception 'Case FAILED: procedure finalidad_code not persisted'; end if;
  raise notice 'Case OK: clinically-active clinic_admin fills a procedure''s finalidad_code';

  -- ------------------------------------------------------------
  -- AUTHORIZATION — a purely administrative clinic_admin (no
  -- professional_profile) is rejected. Nothing changes.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_pure_user::text, true);
  v_failed := false;
  begin
    perform public.correct_encounter_service_rips_field(v_service_procedure, 'causa_motivo_code', 'QA-CAU');
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
    perform public.correct_encounter_service_rips_field(v_service_procedure, 'causa_motivo_code', 'QA-CAU');
  exception
    when sqlstate '42501' then v_failed := true;
    when others then raise exception 'Case FAILED (assistant): unexpected error: %', sqlerrm;
  end;
  if not v_failed then raise exception 'Case FAILED: expected 42501 for an assistant'; end if;
  raise notice 'Case OK: an assistant is rejected';

  -- ------------------------------------------------------------
  -- AUTHORIZATION — an active dentist of a DIFFERENT clinic is rejected.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dentist_b_user::text, true);
  v_failed := false;
  begin
    perform public.correct_encounter_service_rips_field(v_service_procedure, 'causa_motivo_code', 'QA-CAU');
  exception
    when sqlstate '42501' then v_failed := true;
    when others then raise exception 'Case FAILED (cross-clinic dentist): unexpected error: %', sqlerrm;
  end;
  if not v_failed then raise exception 'Case FAILED: expected 42501 for a cross-clinic dentist'; end if;
  raise notice 'Case OK: an active dentist of another clinic cannot correct clinic A''s data';

  -- ------------------------------------------------------------
  -- SAFETY — encounter not finalized yet.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dentist_a_user::text, true);
  v_failed := false;
  begin
    perform public.correct_encounter_service_rips_field(
      (select id from public.encounter_services where encounter_id = v_encounter_not_finalized), 'finalidad_code', 'QA-FIN'
    );
  exception
    when others then
      v_failed := sqlerrm like '%finalized%';
      if not v_failed then raise exception 'Case FAILED (not finalized): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a non-finalized encounter'; end if;
  raise notice 'Case OK: a non-finalized encounter is rejected';

  -- ------------------------------------------------------------
  -- SAFETY — finalidad_code already set: reject, even with the SAME
  -- value already persisted (no silent no-op, no silent overwrite).
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.correct_encounter_service_rips_field(v_service_consultation, 'finalidad_code', 'QA-FIN');
  exception
    when others then
      v_failed := sqlerrm like '%already set%';
      if not v_failed then raise exception 'Case FAILED (already set, same value): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for an already-set finalidad_code (same value)'; end if;
  raise notice 'Case OK: re-applying the SAME value to an already-set field is still rejected, not a silent no-op';

  -- ------------------------------------------------------------
  -- SAFETY — causa_motivo_code already set: reject with a DIFFERENT value too.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.correct_encounter_service_rips_field(v_service_consultation, 'causa_motivo_code', 'QA-FIN');
  exception
    when others then
      v_failed := sqlerrm like '%already set%';
      if not v_failed then raise exception 'Case FAILED (already set, different value): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for an already-set causa_motivo_code'; end if;
  raise notice 'Case OK: an already-set causa_motivo_code is rejected even with a different requested value';

  -- ------------------------------------------------------------
  -- SAFETY — unsupported field name.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.correct_encounter_service_rips_field(v_service_procedure, 'cod_servicio_code', 'QA-FIN');
  exception
    when others then
      v_failed := sqlerrm like '%unsupported field%';
      if not v_failed then raise exception 'Case FAILED (bad field): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for an unsupported field name'; end if;
  raise notice 'Case OK: an unsupported field name is rejected';

  -- ------------------------------------------------------------
  -- SAFETY — causa_motivo_code never applies to a procedure.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.correct_encounter_service_rips_field(v_service_procedure, 'causa_motivo_code', 'QA-CAU');
  exception
    when others then
      v_failed := sqlerrm like '%only applies to a consultation%';
      if not v_failed then raise exception 'Case FAILED (causa on procedure): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for causa_motivo_code on a procedure'; end if;
  raise notice 'Case OK: causa_motivo_code is rejected for a procedure-classified service';

  raise notice 'ALL CASES PASSED';
end;
$$;

rollback;
