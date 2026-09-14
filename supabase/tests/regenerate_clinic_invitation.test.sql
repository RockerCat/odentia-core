-- Odentia Core — SQL-layer regression test for
-- 20260914110000_regenerate_clinic_invitation_rpc.sql (and the
-- "Invitaciones pendientes" listing query it backs, fetchPendingInvitations
-- in src/features/clinic/data.ts).
--
-- Same conventions as
-- supabase/tests/seed_default_professional_availability.test.sql: a plain
-- psql script (no pgTAP), meant to run against a local Supabase Postgres
-- (`supabase start` + `supabase db reset`) AFTER both
-- 20260914090000_seed_default_professional_availability.sql and this
-- migration have been reviewed and applied there — NOT against the shared
-- dev/prod project, and NOT executed as part of this change (same sandbox
-- limitation as before: no local Postgres/docker available — see the
-- task's own final report).
--
-- Unlike the availability test, regenerate_clinic_invitation() and
-- accept_clinic_invitation() both resolve auth.uid() themselves, so this
-- test impersonates real users via set_config('request.jwt.claim.sub', ...)
-- — the standard local-Supabase trick for exercising auth.uid()-gated
-- SECURITY DEFINER functions from plain SQL, since auth.uid() only ever
-- reads that GUC, never an actual Postgres role. profiles.id/clinic_
-- memberships.profile_id both carry real FKs down to auth.users (see the
-- foundation schema) and auth.users itself auto-provisions its matching
-- profiles row via the existing handle_new_user trigger — so each
-- simulated user below is a real (if minimal) auth.users row, not a bare
-- profiles insert. The exact NOT-NULL column set on auth.users comes from
-- the GoTrue-managed `auth` schema, not from this repo's own migrations —
-- if a local Supabase version needs a slightly different minimal row
-- shape, adjust the three inserts below, nothing else.
--
-- Concurrency hardening (`for update` on the initial read, `and status =
-- 'pending'` on the UPDATE itself, and a row_count check after it) is not
-- re-tested with an actual two-connection race here — a real race needs
-- two concurrent sessions/transactions, which this single-session,
-- single-transaction script deliberately doesn't attempt to simulate (per
-- this task's own scope: no artificial concurrency rig). The closest
-- reasonable single-session check is included instead, at the bottom:
-- regenerating an invitation that is no longer 'pending' (right after it
-- was accepted) must still be rejected and must leave the row untouched —
-- exercising the exact same guarded read/UPDATE path the real race
-- protects, just not the race itself.
--
-- Everything below runs inside one transaction that is always rolled back
-- at the end: safe to run repeatedly, never leaves fixture rows (including
-- the auth.users ones) behind.

begin;

do $$
declare
  v_clinic_a uuid;
  v_clinic_b uuid;
  v_admin_a_user uuid;
  v_admin_b_user uuid;
  v_invitee_user uuid;
  v_membership_a uuid;
  v_membership_b uuid;
  v_invitation_id uuid;
  v_raw_token_1 text;
  v_raw_token_2 text;
  v_hash_before text;
  v_hash_after text;
  v_expires_before timestamptz;
  v_expires_after timestamptz;
  v_row record;
  v_count integer;
  v_members_before integer;
  v_members_after integer;
  v_profiles_before integer;
  v_profiles_after integer;
  v_failed boolean;
begin
  -- ------------------------------------------------------------
  -- Fixture: Clinica A (admin_a) + Clinica B (admin_b, unrelated) + the
  -- person who will accept the invitation (invitee).
  -- ------------------------------------------------------------
  v_admin_a_user := gen_random_uuid();
  v_admin_b_user := gen_random_uuid();
  v_invitee_user := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    ('00000000-0000-0000-0000-000000000000', v_admin_a_user, 'authenticated', 'authenticated',
     'admin-a@qa-invite-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_admin_b_user, 'authenticated', 'authenticated',
     'admin-b@qa-invite-test.local', 'x', now(), now(), now(), '{}', '{}'),
    ('00000000-0000-0000-0000-000000000000', v_invitee_user, 'authenticated', 'authenticated',
     'nuevo@qa-invite-test.local', 'x', now(), now(), now(), '{}', '{}');
  -- handle_new_user (foundation schema) auto-creates the matching
  -- public.profiles row for each, email included — never inserted by hand.

  insert into public.clinics (name, slug) values ('QA Invite Test Clinic A', 'qa-invite-test-clinic-a')
  returning id into v_clinic_a;
  insert into public.clinics (name, slug) values ('QA Invite Test Clinic B', 'qa-invite-test-clinic-b')
  returning id into v_clinic_b;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_a, v_admin_a_user, 'clinic_admin', 'active', now())
  returning id into v_membership_a;
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, joined_at)
  values (v_clinic_b, v_admin_b_user, 'clinic_admin', 'active', now())
  returning id into v_membership_b;

  -- ------------------------------------------------------------
  -- Admin A invites a Dentista for Clinica A — the real path
  -- (invite_clinic_member), not a hand-built clinic_invitations row.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);

  select id, raw_token into v_invitation_id, v_raw_token_1
  from public.invite_clinic_member('nuevo@qa-invite-test.local', 'dentist');

  select token_hash, expires_at into v_hash_before, v_expires_before
  from public.clinic_invitations where id = v_invitation_id;

  -- ------------------------------------------------------------
  -- Case 1: invitacion pendiente aparece con email (misma query shape as
  -- fetchPendingInvitations in src/features/clinic/data.ts).
  -- ------------------------------------------------------------
  select * into v_row
  from public.clinic_invitations
  where clinic_id = v_clinic_a and status = 'pending' and id = v_invitation_id;
  if v_row.id is null or v_row.email <> 'nuevo@qa-invite-test.local' then
    raise exception 'Case 1 FAILED: pending invitation with correct email not found, got %', v_row;
  end if;
  raise notice 'Case 1 OK: pending invitation appears with the persisted email';

  -- ------------------------------------------------------------
  -- Case 4: Admin de otra clinica (Clinica B) NO puede regenerar la
  -- invitacion de Clinica A.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_admin_b_user::text, true);
  v_failed := false;
  begin
    perform public.regenerate_clinic_invitation(v_invitation_id);
  exception
    when sqlstate '42501' then
      v_failed := true;
    when others then
      raise exception 'Case 4 FAILED: unexpected error instead of the authorization check: %', sqlerrm;
  end;
  if not v_failed then
    raise exception 'Case 4 FAILED: expected 42501 for an admin of a different clinic, none was raised';
  end if;

  perform 1 from public.clinic_invitations where id = v_invitation_id and token_hash = v_hash_before;
  if not found then
    raise exception 'Case 4 FAILED: a rejected cross-clinic regenerate must not change the token_hash';
  end if;
  raise notice 'Case 4 OK: an admin of a different clinic cannot regenerate, and nothing changed';

  -- ------------------------------------------------------------
  -- Case 3, 5, 7, 8, 9: Admin A (same clinic) DOES regenerate successfully.
  -- ------------------------------------------------------------
  select count(*) into v_members_before from public.clinic_memberships where clinic_id = v_clinic_a;
  select count(*) into v_profiles_before from public.professional_profiles where clinic_id = v_clinic_a;

  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);

  select id, email, role, status, expires_at, raw_token
  into v_row
  from public.regenerate_clinic_invitation(v_invitation_id);
  v_raw_token_2 := v_row.raw_token;
  v_expires_after := v_row.expires_at;

  if v_raw_token_2 is null or v_raw_token_2 = v_raw_token_1 then
    raise exception 'Case 3 FAILED: regenerate did not return a fresh raw_token';
  end if;
  raise notice 'Case 3 OK: an admin of the SAME clinic can regenerate';

  select token_hash, expires_at into v_hash_after, v_expires_after
  from public.clinic_invitations where id = v_invitation_id;

  if v_hash_after = v_hash_before then
    raise exception 'Case 5 FAILED: token_hash did not change after regenerating';
  end if;
  if v_hash_after <> encode(extensions.digest(v_raw_token_2, 'sha256'), 'hex') then
    raise exception 'Case 5 FAILED: persisted token_hash does not match sha256(new raw_token)';
  end if;
  raise notice 'Case 5 OK: regenerate changes token_hash to match the newly returned raw_token';

  select * into v_row from public.clinic_invitations where id = v_invitation_id;
  if v_row.email <> 'nuevo@qa-invite-test.local' or v_row.role <> 'dentist' then
    raise exception 'Case 7 FAILED: email/role changed after regenerate: % / %', v_row.email, v_row.role;
  end if;
  if v_row.clinic_id <> v_clinic_a or v_row.status <> 'pending' then
    raise exception 'Case 7 FAILED: clinic_id/status changed after regenerate: % / %', v_row.clinic_id, v_row.status;
  end if;
  raise notice 'Case 7 OK: email and role are unchanged after regenerate';

  if v_expires_after <= now() or v_expires_after <= v_expires_before then
    raise exception 'Case 8 FAILED: new expires_at (%) is not a later, still-valid expiration than before (%)', v_expires_after, v_expires_before;
  end if;
  raise notice 'Case 8 OK: the new expiration is in the future and later than the previous one';

  select count(*) into v_members_after from public.clinic_memberships where clinic_id = v_clinic_a;
  select count(*) into v_profiles_after from public.professional_profiles where clinic_id = v_clinic_a;
  if v_members_after <> v_members_before or v_profiles_after <> v_profiles_before then
    raise exception 'Case 9 FAILED: regenerate must never create a membership or professional_profile (members % -> %, profiles % -> %)',
      v_members_before, v_members_after, v_profiles_before, v_profiles_after;
  end if;
  raise notice 'Case 9 OK: regenerate creates no clinic_membership and no professional_profile';

  -- ------------------------------------------------------------
  -- Case 6: el token ANTERIOR ya no es valido.
  -- ------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_invitee_user::text, true);
  v_failed := false;
  begin
    perform public.accept_clinic_invitation(v_raw_token_1);
  exception
    when others then
      v_failed := sqlerrm like '%not valid%';
      if not v_failed then
        raise exception 'Case 6 FAILED: unexpected error for the old token: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Case 6 FAILED: expected the OLD token to be rejected as invalid, it was accepted';
  end if;
  raise notice 'Case 6 OK: the previous token no longer works';

  -- ------------------------------------------------------------
  -- Case 2 + 10: accept_clinic_invitation() sigue funcionando con el
  -- token NUEVO, y la invitacion aceptada deja de aparecer como pendiente.
  -- ------------------------------------------------------------
  select clinic_id, role into v_row from public.accept_clinic_invitation(v_raw_token_2);
  raise notice 'Case 10 OK: accept_clinic_invitation() succeeds with the regenerated token';

  select count(*) into v_count
  from public.clinic_invitations
  where clinic_id = v_clinic_a and status = 'pending' and id = v_invitation_id;
  if v_count <> 0 then
    raise exception 'Case 2 FAILED: an accepted invitation still appears as pending';
  end if;
  raise notice 'Case 2 OK: an accepted invitation no longer appears in the pending listing';

  -- ------------------------------------------------------------
  -- Concurrency-hardening guard (`for update` + the UPDATE's own
  -- `and status = 'pending'` + row_count check): a real two-connection
  -- race isn't worth simulating here (see this file's own header comment),
  -- but this end-to-end call exercises the exact same guarded read/UPDATE
  -- path against a row that is no longer pending — admin_a tries to
  -- regenerate the invitation again right after it was accepted above.
  -- Must be rejected, and must leave token_hash/expires_at untouched.
  -- ------------------------------------------------------------
  select token_hash, expires_at into v_hash_before, v_expires_before
  from public.clinic_invitations where id = v_invitation_id;

  perform set_config('request.jwt.claim.sub', v_admin_a_user::text, true);
  v_failed := false;
  begin
    perform public.regenerate_clinic_invitation(v_invitation_id);
  exception
    when others then
      v_failed := sqlerrm like '%pending%';
      if not v_failed then
        raise exception 'Concurrency-guard FAILED: unexpected error for an already-accepted invitation: %', sqlerrm;
      end if;
  end;
  if not v_failed then
    raise exception 'Concurrency-guard FAILED: regenerating an already-accepted invitation must be rejected';
  end if;

  select token_hash, expires_at into v_hash_after, v_expires_after
  from public.clinic_invitations where id = v_invitation_id;
  if v_hash_after <> v_hash_before or v_expires_after <> v_expires_before then
    raise exception 'Concurrency-guard FAILED: a rejected regenerate must never persist a new token_hash/expires_at';
  end if;
  raise notice 'Concurrency-guard OK: the guarded UPDATE (status=pending + row_count check) rejects a non-pending row and changes nothing';

  raise notice 'ALL CASES PASSED';
end;
$$;

rollback;
