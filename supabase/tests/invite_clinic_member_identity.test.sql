-- Odentia Core — SQL-layer regression test for "Unify clinic team
-- invitation activation" (migration 20260921140000): invite_clinic_member()
-- now requires complete pre-provisioned identity (first_name/last_name/
-- phone), same fields/validation as provision_clinic_team_member()
-- (20260916180000), so a Clinic-Admin-issued invitation activates by
-- password only (activatePreProvisionedInvitationAction()), never
-- auth.signUp()/Confirm Signup.
--
-- Same conventions as every other supabase/tests/*.test.sql file in this
-- repo: a plain psql script (no pgTAP), meant to run against a local
-- Supabase Postgres (`supabase start` + `supabase db reset`) — NOT
-- against the shared dev/prod project, and NOT executed as part of this
-- change (no local Postgres/docker available in this environment — see
-- this task's own final report; reported as NOT RUN, never a false
-- PASS). Impersonates real users via set_config('request.jwt.claim.sub',
-- ...). Runs inside one transaction, always rolled back at the end.

begin;

do $$
declare
  v_admin_a_user uuid;
  v_admin_b_user uuid;
  v_dentist_a_user uuid;
  v_clinic_a uuid;
  v_clinic_b uuid;
  v_invitation_id uuid;
  v_raw_token text;
  v_row record;
  v_preview record;
  v_failed boolean;
begin
  -- ------------------------------------------------------------
  -- Fixture: two clinics, an active clinic_admin in each, and a plain
  -- (non-admin) dentist in clinic A.
  -- ------------------------------------------------------------
  v_admin_a_user := gen_random_uuid();
  v_admin_b_user := gen_random_uuid();
  v_dentist_a_user := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    ('00000000-0000-0000-0000-000000000000', v_admin_a_user, 'authenticated', 'authenticated',
     'admin-a@qa-invite-identity-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_admin_b_user, 'authenticated', 'authenticated',
     'admin-b@qa-invite-identity-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_dentist_a_user, 'authenticated', 'authenticated',
     'dentist-a@qa-invite-identity-test.local', 'x', now(), now(), now(), '{}', '{}');

  insert into public.clinics (name, slug) values ('QA Invite Identity Clinic A', 'qa-invite-identity-clinic-a')
  returning id into v_clinic_a;
  insert into public.clinics (name, slug) values ('QA Invite Identity Clinic B', 'qa-invite-identity-clinic-b')
  returning id into v_clinic_b;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_admin_a_user, 'clinic_admin', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_b, v_admin_b_user, 'clinic_admin', 'active', now());
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_dentist_a_user, 'dentist', 'active', now());

  -- ------------------------------------------------------------
  -- Case: a non-admin (plain dentist) cannot invite — unchanged
  -- authorization boundary.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dentist_a_user::text, true);
  v_failed := false;
  begin
    perform public.invite_clinic_member('someone@qa-invite-identity-test.local', 'assistant', 'Ana', 'Asistente', '+57 300 1111111');
  exception
    when sqlstate '42501' then v_failed := true;
    when others then raise exception 'Case FAILED (non-admin): unexpected error: %', sqlerrm;
  end;
  if not v_failed then raise exception 'Case FAILED: expected 42501 for a non-admin caller'; end if;
  raise notice 'Case OK: a non-admin (dentist) cannot invite a team member';

  -- ------------------------------------------------------------
  -- Case: an unauthenticated caller (no request.jwt.claim.sub) is
  -- rejected before any identity/role validation.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', '', true);
  v_failed := false;
  begin
    perform public.invite_clinic_member('someone@qa-invite-identity-test.local', 'assistant', 'Ana', 'Asistente', '+57 300 1111111');
  exception
    when others then
      v_failed := sqlerrm like '%authenticated session%';
      if not v_failed then raise exception 'Case FAILED (unauthenticated): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for an unauthenticated caller'; end if;
  raise notice 'Case OK: an unauthenticated caller is rejected';

  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);

  -- ------------------------------------------------------------
  -- Case: role stays restricted to dentist/assistant — unchanged rule,
  -- a Clinic Admin still cannot mint a second clinic_admin this way.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.invite_clinic_member('segundo-admin@qa-invite-identity-test.local', 'clinic_admin', 'Otro', 'Admin', '+57 300 2222222');
  exception
    when others then
      v_failed := sqlerrm like '%dentist or assistant%';
      if not v_failed then raise exception 'Case FAILED (role restriction): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for role = clinic_admin'; end if;
  raise notice 'Case OK: invite_clinic_member() still only allows dentist/assistant';

  -- ------------------------------------------------------------
  -- Case: an invalid email is still rejected before identity checks run.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.invite_clinic_member('not-an-email', 'dentist', 'Nuevo', 'Dentista', '+57 300 3333333');
  exception
    when others then
      v_failed := sqlerrm like '%valid email%';
      if not v_failed then raise exception 'Case FAILED (invalid email): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for an invalid email'; end if;
  raise notice 'Case OK: an invalid email is still rejected';

  -- ------------------------------------------------------------
  -- Case: empty/blank first_name, last_name, and phone are each rejected
  -- individually — the whole point of this checkpoint.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.invite_clinic_member('nuevo1@qa-invite-identity-test.local', 'dentist', '   ', 'Dentista', '+57 300 3333333');
  exception
    when others then
      v_failed := sqlerrm like '%first_name must not be empty%';
      if not v_failed then raise exception 'Case FAILED (blank first_name): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a blank first_name'; end if;

  v_failed := false;
  begin
    perform public.invite_clinic_member('nuevo1@qa-invite-identity-test.local', 'dentist', 'Nuevo', '', '+57 300 3333333');
  exception
    when others then
      v_failed := sqlerrm like '%last_name must not be empty%';
      if not v_failed then raise exception 'Case FAILED (blank last_name): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a blank last_name'; end if;

  v_failed := false;
  begin
    perform public.invite_clinic_member('nuevo1@qa-invite-identity-test.local', 'dentist', 'Nuevo', 'Dentista', null);
  exception
    when others then
      v_failed := sqlerrm like '%phone must not be empty%';
      if not v_failed then raise exception 'Case FAILED (null phone): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a null phone'; end if;
  raise notice 'Case OK: blank/null first_name, last_name, and phone are each rejected individually';

  -- ------------------------------------------------------------
  -- Case: the real success path — identity persists exactly as given
  -- (trimmed), email normalized to lowercase, clinic_id derived from the
  -- caller (never a parameter — this function has none).
  -- ------------------------------------------------------------
  select id, raw_token into v_invitation_id, v_raw_token
  from public.invite_clinic_member('  Nuevo.Dentista@QA-Invite-Identity-Test.local  ', 'dentist', '  Nuevo  ', '  Dentista  ', '  +57 300 4444444  ');

  select * into v_row from public.clinic_invitations where id = v_invitation_id;
  if v_row.clinic_id <> v_clinic_a then
    raise exception 'Case FAILED (success): invitation must belong to the caller''s own clinic, got %', v_row.clinic_id;
  end if;
  if v_row.email <> 'nuevo.dentista@qa-invite-identity-test.local' then
    raise exception 'Case FAILED (success): email must be normalized to lowercase/trimmed, got %', v_row.email;
  end if;
  if v_row.first_name <> 'Nuevo' or v_row.last_name <> 'Dentista' or v_row.phone <> '+57 300 4444444' then
    raise exception 'Case FAILED (success): first_name/last_name/phone must persist trimmed exactly as given, got % / % / %',
      v_row.first_name, v_row.last_name, v_row.phone;
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Case FAILED (success): a brand-new invitation must be pending, got %', v_row.status;
  end if;
  raise notice 'Case OK: a valid invitation persists clinic_id/email/first_name/last_name/phone correctly';

  -- ------------------------------------------------------------
  -- Case: preview_clinic_invitation() — the SAME, unmodified RPC
  -- hasPreProvisionedIdentity() (team-actions.ts) already consumes for a
  -- Superadmin-issued invitation — now also reports this NEW Clinic-Admin
  -- invitation as usable AND carrying complete identity, with zero
  -- changes to that RPC. This is the real end-to-end proof that a
  -- brand-new Clinic-Admin invitation routes to the password-only
  -- activation view exactly like a Platform-issued one does.
  -- ------------------------------------------------------------
  select * into v_preview from public.preview_clinic_invitation(v_raw_token);
  if not v_preview.usable then
    raise exception 'Case FAILED (preview): a brand-new pending invitation must be usable';
  end if;
  if v_preview.first_name is null or v_preview.last_name is null or v_preview.phone is null then
    raise exception 'Case FAILED (preview): expected complete identity (first_name=%, last_name=%, phone=%) — hasPreProvisionedIdentity() would incorrectly fall back to AccountStep',
      v_preview.first_name, v_preview.last_name, v_preview.phone;
  end if;
  raise notice 'Case OK: preview_clinic_invitation() reports the new invitation as usable with complete identity, unchanged RPC';

  -- ------------------------------------------------------------
  -- Case: existing duplicate-invitation/duplicate-membership rules are
  -- unchanged by this migration.
  -- ------------------------------------------------------------
  v_failed := false;
  begin
    perform public.invite_clinic_member('nuevo.dentista@qa-invite-identity-test.local', 'dentist', 'Otro', 'Nombre', '+57 300 5555555');
  exception
    when others then
      v_failed := sqlerrm like '%pending invitation%';
      if not v_failed then raise exception 'Case FAILED (duplicate pending): unexpected error: %', sqlerrm; end if;
  end;
  if not v_failed then raise exception 'Case FAILED: expected rejection for a second pending invitation to the same email'; end if;
  raise notice 'Case OK: a second pending invitation for the same email is still rejected';

  -- ------------------------------------------------------------
  -- Case: clinic B's admin can independently invite into clinic B —
  -- clinic_id isolation unchanged, never cross-tenant.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_b_user::text, true);
  select id into v_invitation_id
  from public.invite_clinic_member('nueva-asistente@qa-invite-identity-test.local', 'assistant', 'Asis', 'Tente', '+57 300 6666666');

  perform 1 from public.clinic_invitations where id = v_invitation_id and clinic_id = v_clinic_b;
  if not found then
    raise exception 'Case FAILED (cross-tenant isolation): admin_b''s invitation must belong to clinic_b, never clinic_a';
  end if;
  raise notice 'Case OK: clinic_id stays isolated per caller, never cross-tenant';

  raise notice 'ALL CASES PASSED';
end;
$$;

rollback;
