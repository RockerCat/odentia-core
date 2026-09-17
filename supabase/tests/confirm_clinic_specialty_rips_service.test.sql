-- Odentia Core — SQL-layer regression test for "RIPS Fase A4: write path
-- for clinic_specialty_rips_services"
-- (20260917100000_create_confirm_clinic_specialty_rips_service_rpc.sql).
--
-- Same conventions as supabase/tests/regenerate_clinic_invitation.test.sql
-- and supabase/tests/patient_access_invitation.test.sql: a plain psql
-- script (no pgTAP), meant to run against a local Supabase Postgres
-- (`supabase start` + `supabase db reset`) — NOT against the shared
-- dev/prod project, and NOT executed as part of this change (no local
-- Postgres/docker available in this environment — see this task's own
-- final report; reported as NOT EXECUTED, never a false PASS).
-- Impersonates real users via set_config('request.jwt.claim.sub', ...) to
-- exercise the auth.uid()-gated SECURITY DEFINER function from plain SQL.
-- Everything below runs inside one transaction that is always rolled
-- back at the end: safe to run repeatedly, never leaves fixture rows
-- (including the auth.users/rips_catalog_imports/rips_reference_values
-- ones) behind.
--
-- Fixture catalog data is deliberately fake/obviously-QA (codes prefixed
-- 'QA-'), under its own dedicated rips_catalog_imports row (catalog_key
-- 'QA-TEST-A4-*', never colliding with the real active 'GrupoServicios'/
-- 'Servicios' import) — this test never depends on or mutates the real
-- imported RIPS catalogs, and never depends on any specialty already
-- seeded in a real target database (specialties has no seed data by
-- design — see the foundation schema's own comment).

begin;

do $$
declare
  v_import_id uuid;
  v_admin_a_user uuid;
  v_admin_b_user uuid;
  v_dentist_a_user uuid;
  v_clinic_a uuid;
  v_clinic_b uuid;
  v_specialty_1 uuid;
  v_specialty_2 uuid;
  v_specialty_inactive uuid;
  v_grupo_1_id uuid;
  v_grupo_2_id uuid;
  v_servicio_1_id uuid;
  v_servicio_2_id uuid;
  v_servicio_no_parent_id uuid;
  v_servicio_orphan_grupo_id uuid;
  v_servicio_inactive_id uuid;
  v_row public.clinic_specialty_rips_services;
  v_count integer;
  v_failed boolean;
begin
  -- ------------------------------------------------------------
  -- Fixture: fake catalog data (own import, own codes — never the real
  -- GrupoServicios/Servicios rows).
  -- ------------------------------------------------------------
  insert into public.rips_catalog_imports (catalog_key, version_label, valid_from, row_count, imported_by)
  values ('QA-TEST-A4', 'qa-a4', current_date, 0, 'test:confirm_clinic_specialty_rips_service')
  returning id into v_import_id;

  insert into public.rips_reference_values (import_id, catalog_key, code, label, version_label, valid_from, status)
  values (v_import_id, 'GrupoServicios', 'QA-GRP-1', 'QA Grupo Uno', 'qa-a4', current_date, 'active')
  returning id into v_grupo_1_id;

  insert into public.rips_reference_values (import_id, catalog_key, code, label, version_label, valid_from, status)
  values (v_import_id, 'GrupoServicios', 'QA-GRP-2', 'QA Grupo Dos', 'qa-a4', current_date, 'active')
  returning id into v_grupo_2_id;

  insert into public.rips_reference_values (import_id, catalog_key, code, label, parent_code, version_label, valid_from, status)
  values (v_import_id, 'Servicios', 'QA-SVC-1', 'QA Servicio Uno', 'QA-GRP-1', 'qa-a4', current_date, 'active')
  returning id into v_servicio_1_id;

  insert into public.rips_reference_values (import_id, catalog_key, code, label, parent_code, version_label, valid_from, status)
  values (v_import_id, 'Servicios', 'QA-SVC-2', 'QA Servicio Dos', 'QA-GRP-2', 'qa-a4', current_date, 'active')
  returning id into v_servicio_2_id;

  -- Servicio with NO parent_code — must be rejected ("no Grupo").
  insert into public.rips_reference_values (import_id, catalog_key, code, label, parent_code, version_label, valid_from, status)
  values (v_import_id, 'Servicios', 'QA-SVC-NO-PARENT', 'QA Servicio Sin Grupo', null, 'qa-a4', current_date, 'active')
  returning id into v_servicio_no_parent_id;

  -- Servicio whose parent_code points at a Grupo that does NOT exist as an
  -- active row — must be rejected ("Grupo ... is not an active row").
  insert into public.rips_reference_values (import_id, catalog_key, code, label, parent_code, version_label, valid_from, status)
  values (v_import_id, 'Servicios', 'QA-SVC-ORPHAN', 'QA Servicio Huérfano', 'QA-GRP-MISSING', 'qa-a4', current_date, 'active')
  returning id into v_servicio_orphan_grupo_id;

  -- An inactive (superseded) Servicio — must be rejected ("not found").
  insert into public.rips_reference_values (import_id, catalog_key, code, label, parent_code, version_label, valid_from, valid_to, status)
  values (v_import_id, 'Servicios', 'QA-SVC-OLD', 'QA Servicio Viejo', 'QA-GRP-1', 'qa-a4-old', current_date - 30, current_date - 1, 'superseded')
  returning id into v_servicio_inactive_id;

  -- ------------------------------------------------------------
  -- Fixture: two clinics, an admin each, and a non-admin (dentist) in
  -- clinic A.
  -- ------------------------------------------------------------
  v_admin_a_user := gen_random_uuid();
  v_admin_b_user := gen_random_uuid();
  v_dentist_a_user := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    ('00000000-0000-0000-0000-000000000000', v_admin_a_user, 'authenticated', 'authenticated',
     'admin-a@qa-a4-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_admin_b_user, 'authenticated', 'authenticated',
     'admin-b@qa-a4-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_dentist_a_user, 'authenticated', 'authenticated',
     'dentist-a@qa-a4-test.local', 'x', now(), now(), now(), '{}', '{}');
  -- handle_new_user (foundation schema) auto-creates the matching
  -- public.profiles row for each.

  insert into public.clinics (name, slug) values ('QA A4 Test Clinic A', 'qa-a4-test-clinic-a') returning id into v_clinic_a;
  insert into public.clinics (name, slug) values ('QA A4 Test Clinic B', 'qa-a4-test-clinic-b') returning id into v_clinic_b;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_admin_a_user, 'clinic_admin', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_b, v_admin_b_user, 'clinic_admin', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_dentist_a_user, 'dentist', 'active', now());

  insert into public.specialties (name) values ('QA Especialidad Uno A4') returning id into v_specialty_1;
  insert into public.specialties (name) values ('QA Especialidad Dos A4') returning id into v_specialty_2;
  insert into public.specialties (name, active) values ('QA Especialidad Inactiva A4', false) returning id into v_specialty_inactive;

  -- ------------------------------------------------------------
  -- Case 1: clinic_admin confirms her OWN clinic's specialty — succeeds.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);

  select * into v_row
  from public.confirm_clinic_specialty_rips_service(v_specialty_1, v_servicio_1_id);

  if v_row.clinic_id <> v_clinic_a or v_row.specialty_id <> v_specialty_1
     or v_row.rips_reference_value_id <> v_servicio_1_id or v_row.status <> 'active' then
    raise exception 'Case 1 FAILED: unexpected result row %', v_row;
  end if;
  raise notice 'Case 1 OK: clinic_admin confirms her own clinic''s specialty';

  select count(*) into v_count
  from public.clinic_specialty_rips_services
  where clinic_id = v_clinic_a and specialty_id = v_specialty_1 and status = 'active';
  if v_count <> 1 then
    raise exception 'Case 2 FAILED: expected exactly 1 active row, got %', v_count;
  end if;
  raise notice 'Case 2 OK: exactly one active row exists after confirming';

  -- ------------------------------------------------------------
  -- Case 3: a non-admin (dentist) of the SAME clinic cannot write —
  -- nothing changes.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dentist_a_user::text, true);
  v_failed := false;
  begin
    perform public.confirm_clinic_specialty_rips_service(v_specialty_1, v_servicio_2_id);
  exception
    when sqlstate '42501' then
      v_failed := true;
    when others then
      raise exception 'Case 3 FAILED: unexpected error instead of the authorization check: %', sqlerrm;
  end;
  if not v_failed then
    raise exception 'Case 3 FAILED: expected 42501 for a non-admin, none was raised';
  end if;

  select rips_reference_value_id into v_row.rips_reference_value_id
  from public.clinic_specialty_rips_services
  where clinic_id = v_clinic_a and specialty_id = v_specialty_1 and status = 'active';
  if v_row.rips_reference_value_id <> v_servicio_1_id then
    raise exception 'Case 3 FAILED: a rejected non-admin write must never change the active configuration';
  end if;
  raise notice 'Case 3 OK: a non-admin (dentist) cannot write, and nothing changed';

  -- ------------------------------------------------------------
  -- Case 4: cross-clinic isolation — clinic B's admin confirming the SAME
  -- specialty only ever affects clinic B's own row, never clinic A's.
  -- clinic_id is not a parameter at all, so there is nothing to spoof.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_b_user::text, true);
  select * into v_row
  from public.confirm_clinic_specialty_rips_service(v_specialty_1, v_servicio_1_id);
  if v_row.clinic_id <> v_clinic_b then
    raise exception 'Case 4 FAILED: admin_b''s confirmation must be scoped to clinic_b, got clinic_id %', v_row.clinic_id;
  end if;

  select rips_reference_value_id into v_row.rips_reference_value_id
  from public.clinic_specialty_rips_services
  where clinic_id = v_clinic_a and specialty_id = v_specialty_1 and status = 'active';
  if v_row.rips_reference_value_id <> v_servicio_1_id then
    raise exception 'Case 4 FAILED: clinic_a''s own configuration must be untouched by clinic_b''s admin';
  end if;
  raise notice 'Case 4 OK: cross-clinic isolation holds — each admin only ever affects her own clinic''s row';

  -- ------------------------------------------------------------
  -- Case 5: reconfirm (change) — supersedes the previous active row
  -- atomically, exactly one active row remains.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);
  select * into v_row
  from public.confirm_clinic_specialty_rips_service(v_specialty_1, v_servicio_2_id);
  if v_row.rips_reference_value_id <> v_servicio_2_id or v_row.status <> 'active' then
    raise exception 'Case 5 FAILED: reconfirm did not produce the new active row, got %', v_row;
  end if;

  select count(*) into v_count
  from public.clinic_specialty_rips_services
  where clinic_id = v_clinic_a and specialty_id = v_specialty_1 and status = 'active';
  if v_count <> 1 then
    raise exception 'Case 5 FAILED: expected exactly 1 active row after reconfirm, got %', v_count;
  end if;

  select count(*) into v_count
  from public.clinic_specialty_rips_services
  where clinic_id = v_clinic_a and specialty_id = v_specialty_1
    and rips_reference_value_id = v_servicio_1_id and status = 'superseded';
  if v_count <> 1 then
    raise exception 'Case 5 FAILED: the previous configuration must be preserved as superseded history, not deleted';
  end if;
  raise notice 'Case 5 OK: reconfirming supersedes the previous row atomically, history preserved, one active row remains';

  -- ------------------------------------------------------------
  -- Case 6: invalid specialty id → rejected.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.confirm_clinic_specialty_rips_service(gen_random_uuid(), v_servicio_1_id);
  exception
    when others then
      v_failed := sqlerrm like '%specialty not found%';
      if not v_failed then
        raise exception 'Case 6 FAILED: unexpected error for an invalid specialty: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 6 FAILED: expected rejection for an invalid specialty, none was raised';
  end if;
  raise notice 'Case 6 OK: an invalid specialty id is rejected';

  -- ------------------------------------------------------------
  -- Case 7: inactive specialty → rejected.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.confirm_clinic_specialty_rips_service(v_specialty_inactive, v_servicio_1_id);
  exception
    when others then
      v_failed := sqlerrm like '%inactive specialty%';
      if not v_failed then
        raise exception 'Case 7 FAILED: unexpected error for an inactive specialty: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 7 FAILED: expected rejection for an inactive specialty, none was raised';
  end if;
  raise notice 'Case 7 OK: an inactive specialty is rejected';

  -- ------------------------------------------------------------
  -- Case 8: Servicio id not found / wrong catalog / superseded → rejected.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.confirm_clinic_specialty_rips_service(v_specialty_2, gen_random_uuid());
  exception
    when others then
      v_failed := sqlerrm like '%Servicio not found%';
      if not v_failed then
        raise exception 'Case 8a FAILED: unexpected error for an unknown Servicio id: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 8a FAILED: expected rejection for an unknown Servicio id, none was raised';
  end if;

  -- Passing a GrupoServicios id where a Servicio is expected — wrong
  -- catalog, must be rejected the same way as "not found" (the WHERE
  -- clause filters catalog_key = 'Servicios').
  v_failed := false;
  begin
    perform public.confirm_clinic_specialty_rips_service(v_specialty_2, v_grupo_1_id);
  exception
    when others then
      v_failed := sqlerrm like '%Servicio not found%';
      if not v_failed then
        raise exception 'Case 8b FAILED: unexpected error for a GrupoServicios id passed as Servicio: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 8b FAILED: expected rejection for a GrupoServicios id passed as Servicio, none was raised';
  end if;

  -- A superseded (inactive) Servicio must also be rejected.
  v_failed := false;
  begin
    perform public.confirm_clinic_specialty_rips_service(v_specialty_2, v_servicio_inactive_id);
  exception
    when others then
      v_failed := sqlerrm like '%Servicio not found%';
      if not v_failed then
        raise exception 'Case 8c FAILED: unexpected error for a superseded Servicio: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 8c FAILED: expected rejection for a superseded Servicio, none was raised';
  end if;
  raise notice 'Case 8 OK: an unknown, wrong-catalog, or superseded Servicio id is rejected in every form';

  -- ------------------------------------------------------------
  -- Case 9: Servicio with no parent_code (no Grupo at all) → rejected.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.confirm_clinic_specialty_rips_service(v_specialty_2, v_servicio_no_parent_id);
  exception
    when others then
      v_failed := sqlerrm like '%has no Grupo de servicios%';
      if not v_failed then
        raise exception 'Case 9 FAILED: unexpected error for a Servicio with no parent_code: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 9 FAILED: expected rejection for a Servicio with no parent_code, none was raised';
  end if;
  raise notice 'Case 9 OK: a Servicio with no Grupo in the catalog is rejected — Grupo is never invented';

  -- ------------------------------------------------------------
  -- Case 10: Servicio whose parent_code has no active GrupoServicios row
  -- → rejected — an inconsistent Grupo/Servicio pair can never persist.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.confirm_clinic_specialty_rips_service(v_specialty_2, v_servicio_orphan_grupo_id);
  exception
    when others then
      v_failed := sqlerrm like '%is not an active row in the official catalog%';
      if not v_failed then
        raise exception 'Case 10 FAILED: unexpected error for an orphan Grupo reference: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 10 FAILED: expected rejection for an orphan Grupo reference, none was raised';
  end if;
  raise notice 'Case 10 OK: a Servicio whose Grupo is not an active catalog row is rejected';

  -- ------------------------------------------------------------
  -- Case 11: a fresh specialty (never confirmed) — Case 2's precondition
  -- generalized: confirming specialty_2 for clinic_a with the valid
  -- v_servicio_2_id succeeds and never disturbs specialty_1's own row.
  -- ------------------------------------------------------------
  select * into v_row
  from public.confirm_clinic_specialty_rips_service(v_specialty_2, v_servicio_2_id);
  if v_row.status <> 'active' or v_row.specialty_id <> v_specialty_2 then
    raise exception 'Case 11 FAILED: confirming a second, independent specialty failed: %', v_row;
  end if;

  select rips_reference_value_id into v_row.rips_reference_value_id
  from public.clinic_specialty_rips_services
  where clinic_id = v_clinic_a and specialty_id = v_specialty_1 and status = 'active';
  if v_row.rips_reference_value_id <> v_servicio_2_id then
    raise exception 'Case 11 FAILED: confirming specialty_2 must never disturb specialty_1''s own active row';
  end if;
  raise notice 'Case 11 OK: two specialties for the same clinic are configured and superseded fully independently';

  raise notice 'ALL CASES PASSED';
end;
$$;

rollback;
