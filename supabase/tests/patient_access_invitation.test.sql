-- Odentia Core — SQL-layer regression test for "Prompt Master — Corregir
-- invitación/acceso de Patient reutilizando el patrón de Team Invitations":
-- preview_patient_access_invitation() (20260917090000, new) alongside the
-- existing create_patient_access_invitation() (20260908110000) and
-- accept_patient_access_invitation() (20260907180000), unmodified by this
-- change.
--
-- Same conventions as supabase/tests/regenerate_clinic_invitation.test.sql:
-- a plain psql script (no pgTAP), meant to run against a local Supabase
-- Postgres (`supabase start` + `supabase db reset`) — NOT against the
-- shared dev/prod project, and NOT executed as part of this change (no
-- local Postgres/docker available in this environment — see this task's
-- own final report). Impersonates real users via
-- set_config('request.jwt.claim.sub', ...) to exercise auth.uid()-gated
-- SECURITY DEFINER functions from plain SQL. Everything below runs inside
-- one transaction that is always rolled back at the end: safe to run
-- repeatedly, never leaves fixture rows (including the auth.users ones)
-- behind.

begin;

do $$
declare
  v_clinic_a uuid;
  v_admin_a_user uuid;
  v_existing_account_user uuid;
  v_claimer_user uuid;
  v_patient_with_email uuid;
  v_patient_no_email uuid;
  v_patient_existing_account uuid;
  v_token_1 text;
  v_token_2 text;
  v_token_3 text;
  v_token_expired text;
  v_token_revoked text;
  v_invitation_expired_id uuid;
  v_invitation_revoked_id uuid;
  v_row record;
  v_failed boolean;
  v_patients_before integer;
  v_patients_after integer;
  v_links_count integer;
begin
  -- ------------------------------------------------------------
  -- Fixture: Clinica A (admin_a), a person who already has an Odentia
  -- account (existing_account_user), and the person who will claim a
  -- fresh invitation (claimer_user) — a DIFFERENT email than the patient's
  -- own, deliberately: patient_access_invitations has no email column at
  -- all (QR/link-claim design), so accepting must never require the
  -- claimer's own email to match the patient's on-file one.
  -- ------------------------------------------------------------
  v_admin_a_user := gen_random_uuid();
  v_existing_account_user := gen_random_uuid();
  v_claimer_user := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    ('00000000-0000-0000-0000-000000000000', v_admin_a_user, 'authenticated', 'authenticated',
     'admin-a@qa-patient-invite-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_existing_account_user, 'authenticated', 'authenticated',
     'ya-tiene-cuenta@qa-patient-invite-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_claimer_user, 'authenticated', 'authenticated',
     'quien-reclama@qa-patient-invite-test.local', 'x', now(), now(), now(), '{}', '{}');
  -- handle_new_user (foundation schema) auto-creates the matching
  -- public.profiles row for each, email included — never inserted by hand.

  insert into public.clinics (name, slug) values ('QA Patient Invite Test Clinic', 'qa-patient-invite-test-clinic')
  returning id into v_clinic_a;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_admin_a_user, 'clinic_admin', 'active', now());

  insert into public.patients (clinic_id, first_name, last_name, email)
  values (v_clinic_a, 'Ana', 'Pérez', 'ana.perez@qa-patient-invite-test.local')
  returning id into v_patient_with_email;

  insert into public.patients (clinic_id, first_name, last_name, email)
  values (v_clinic_a, 'Luis', 'Gómez', null)
  returning id into v_patient_no_email;

  -- Same email as an account that ALREADY exists (existing_account_user
  -- above) — this is the "user_exists" case.
  insert into public.patients (clinic_id, first_name, last_name, email)
  values (v_clinic_a, 'Marta', 'Ríos', 'ya-tiene-cuenta@qa-patient-invite-test.local')
  returning id into v_patient_existing_account;

  -- ------------------------------------------------------------
  -- Case 1: preview de un token inexistente → not-found, usable = false.
  -- ------------------------------------------------------------
  select * into v_row from public.preview_patient_access_invitation('not-a-real-token');
  if v_row.status <> 'not-found' or v_row.usable then
    raise exception 'Case 1 FAILED: unknown token must preview as not-found/unusable, got status=%, usable=%', v_row.status, v_row.usable;
  end if;
  raise notice 'Case 1 OK: an unknown token previews as not-found';

  -- ------------------------------------------------------------
  -- Case 2: staff crea la invitación del Patient con email → preview
  -- resuelve nombre/apellido/correo/clínica reales, sin pedirlos de nuevo.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);
  select raw_token into v_token_1 from public.create_patient_access_invitation(v_patient_with_email);

  -- Reset the JWT claim to simulate an anonymous visitor previewing the
  -- link before any session exists — preview_patient_access_invitation()
  -- must work with no auth.uid() at all.
  perform set_config('request.jwt.claim.sub', '', true);

  select * into v_row from public.preview_patient_access_invitation(v_token_1);
  if v_row.status <> 'pending' or not v_row.usable then
    raise exception 'Case 2 FAILED: a fresh invitation must preview as pending/usable, got status=%, usable=%', v_row.status, v_row.usable;
  end if;
  if v_row.first_name <> 'Ana' or v_row.last_name <> 'Pérez' or v_row.email <> 'ana.perez@qa-patient-invite-test.local' then
    raise exception 'Case 2 FAILED: preview must resolve the real Patient identity, got %/%/%', v_row.first_name, v_row.last_name, v_row.email;
  end if;
  if v_row.clinic_name <> 'QA Patient Invite Test Clinic' then
    raise exception 'Case 2 FAILED: preview must resolve the real clinic name, got %', v_row.clinic_name;
  end if;
  if v_row.user_exists then
    raise exception 'Case 2 FAILED: this Patient email has no Odentia account yet, user_exists must be false';
  end if;
  raise notice 'Case 2 OK: preview resolves the real Patient identity/clinic, never re-asked from the client';

  -- ------------------------------------------------------------
  -- Case 3: Patient sin correo en el sistema → preview expone email = null
  -- y user_exists = false, sin inventar ningún valor.
  -- ------------------------------------------------------------
  select raw_token into v_token_2 from public.create_patient_access_invitation(v_patient_no_email);
  select * into v_row from public.preview_patient_access_invitation(v_token_2);
  if v_row.email is not null then
    raise exception 'Case 3 FAILED: a Patient with no on-file email must preview email as null, got %', v_row.email;
  end if;
  if v_row.user_exists then
    raise exception 'Case 3 FAILED: user_exists must be false when there is no email to check';
  end if;
  if v_row.first_name <> 'Luis' or v_row.last_name <> 'Gómez' then
    raise exception 'Case 3 FAILED: name must still resolve correctly even without an email, got %/%', v_row.first_name, v_row.last_name;
  end if;
  raise notice 'Case 3 OK: a Patient with no on-file email previews honestly (email null), never invented';

  -- ------------------------------------------------------------
  -- Case 4: Patient cuyo correo YA tiene una cuenta Odentia real →
  -- user_exists = true (esto es lo que evita crear una cuenta duplicada).
  -- ------------------------------------------------------------
  select raw_token into v_token_3 from public.create_patient_access_invitation(v_patient_existing_account);
  select * into v_row from public.preview_patient_access_invitation(v_token_3);
  if not v_row.user_exists then
    raise exception 'Case 4 FAILED: a Patient email that already has a real Odentia account must report user_exists = true';
  end if;
  raise notice 'Case 4 OK: user_exists correctly detects an already-existing Odentia account for this Patient email';

  -- ------------------------------------------------------------
  -- Case 5: aceptar con el token 1 vincula al Patient CORRECTO
  -- (patient_with_email), sin crear un Patient duplicado, sin exigir que
  -- el correo del claimer coincida con el del Patient.
  -- ------------------------------------------------------------
  select count(*) into v_patients_before from public.patients where clinic_id = v_clinic_a;

  perform set_config('request.jwt.claim.sub', v_claimer_user::text, true);
  select * into v_row from public.accept_patient_access_invitation(v_token_1);
  if v_row.id <> v_patient_with_email then
    raise exception 'Case 5 FAILED: accept must return the exact Patient the invitation was issued for, got %, expected %', v_row.id, v_patient_with_email;
  end if;

  select count(*) into v_patients_after from public.patients where clinic_id = v_clinic_a;
  if v_patients_after <> v_patients_before then
    raise exception 'Case 5 FAILED: accepting an invitation must never create a new Patient row (before=%, after=%)', v_patients_before, v_patients_after;
  end if;

  select count(*) into v_links_count from public.patient_user_links
  where patient_id = v_patient_with_email and profile_id = v_claimer_user;
  if v_links_count <> 1 then
    raise exception 'Case 5 FAILED: expected exactly one patient_user_links row for this patient/claimer, got %', v_links_count;
  end if;
  raise notice 'Case 5 OK: accepting links the CORRECT existing Patient, never creates a duplicate';

  -- ------------------------------------------------------------
  -- Case 6: reutilizar el mismo token (ya usado) falla cerrado, y no crea
  -- un segundo patient_user_links.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.accept_patient_access_invitation(v_token_1);
  exception
    when others then
      v_failed := sqlerrm like '%already used%' or sqlerrm like '%already linked%';
      if not v_failed then
        raise exception 'Case 6 FAILED: unexpected error for a reused token: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 6 FAILED: a consumed invitation must be rejected on reuse, none was raised';
  end if;

  select count(*) into v_links_count from public.patient_user_links where patient_id = v_patient_with_email;
  if v_links_count <> 1 then
    raise exception 'Case 6 FAILED: a rejected reuse must never create a second link, got % rows', v_links_count;
  end if;
  raise notice 'Case 6 OK: a used token fails closed on reuse, no duplicate link created';

  -- preview must reflect the now-used status too, not just accept().
  perform set_config('request.jwt.claim.sub', '', true);
  select * into v_row from public.preview_patient_access_invitation(v_token_1);
  if v_row.status <> 'used' or v_row.usable then
    raise exception 'Case 6 FAILED: preview of a used token must report status=used/unusable, got status=%, usable=%', v_row.status, v_row.usable;
  end if;
  raise notice 'Case 6 OK: preview also reports a used token as unusable';

  -- ------------------------------------------------------------
  -- Case 7: invitación expirada → preview y accept fallan cerrado.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);
  select id, raw_token into v_invitation_expired_id, v_token_expired
  from public.create_patient_access_invitation(v_patient_no_email);

  update public.patient_access_invitations
  set expires_at = now() - interval '1 day'
  where id = v_invitation_expired_id;

  perform set_config('request.jwt.claim.sub', '', true);
  select * into v_row from public.preview_patient_access_invitation(v_token_expired);
  if v_row.status <> 'expired' or v_row.usable then
    raise exception 'Case 7 FAILED: preview of an expired invitation must report status=expired/unusable, got status=%, usable=%', v_row.status, v_row.usable;
  end if;

  perform set_config('request.jwt.claim.sub', v_claimer_user::text, true);
  v_failed := false;
  begin
    perform public.accept_patient_access_invitation(v_token_expired);
  exception
    when others then
      v_failed := sqlerrm like '%expired%';
      if not v_failed then
        raise exception 'Case 7 FAILED: unexpected error for an expired token: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 7 FAILED: an expired invitation must be rejected on accept, none was raised';
  end if;
  raise notice 'Case 7 OK: an expired invitation fails closed on both preview and accept';

  -- ------------------------------------------------------------
  -- Case 8: invitación revocada → preview y accept fallan cerrado.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);
  select id, raw_token into v_invitation_revoked_id, v_token_revoked
  from public.create_patient_access_invitation(v_patient_existing_account);
  -- v_patient_existing_account already had a still-pending invitation from
  -- Case 4 (v_token_3) — create_patient_access_invitation() silently
  -- supersedes it (revokes v_token_3, mints this fresh one) rather than
  -- refusing, exactly as that RPC's own migration comment documents. Case
  -- 4 already read everything it needed from v_token_3 before this point,
  -- so its own assertions are unaffected.

  update public.patient_access_invitations
  set revoked_at = now()
  where id = v_invitation_revoked_id;

  perform set_config('request.jwt.claim.sub', '', true);
  select * into v_row from public.preview_patient_access_invitation(v_token_revoked);
  if v_row.status <> 'revoked' or v_row.usable then
    raise exception 'Case 8 FAILED: preview of a revoked invitation must report status=revoked/unusable, got status=%, usable=%', v_row.status, v_row.usable;
  end if;

  perform set_config('request.jwt.claim.sub', v_claimer_user::text, true);
  v_failed := false;
  begin
    perform public.accept_patient_access_invitation(v_token_revoked);
  exception
    when others then
      v_failed := sqlerrm like '%revoked%';
      if not v_failed then
        raise exception 'Case 8 FAILED: unexpected error for a revoked token: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 8 FAILED: a revoked invitation must be rejected on accept, none was raised';
  end if;
  raise notice 'Case 8 OK: a revoked invitation fails closed on both preview and accept';

  -- ------------------------------------------------------------
  -- Case 9: token inválido/con formato incorrecto → accept falla cerrado
  -- (regresión directa: nunca debe vincular ningún Patient).
  -- ------------------------------------------------------------
  select count(*) into v_links_count from public.patient_user_links;
  v_failed := false;
  begin
    perform public.accept_patient_access_invitation('garbage-token-that-was-never-issued');
  exception
    when others then
      v_failed := sqlerrm like '%not valid%';
      if not v_failed then
        raise exception 'Case 9 FAILED: unexpected error for a garbage token: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 9 FAILED: an invalid token must be rejected, none was raised';
  end if;
  perform 1 from public.patient_user_links having count(*) = v_links_count;
  if not found then
    raise exception 'Case 9 FAILED: a rejected invalid-token accept must never change patient_user_links';
  end if;
  raise notice 'Case 9 OK: an invalid token fails closed and links nothing';

  raise notice 'ALL CASES PASSED';
end;
$$;

rollback;
