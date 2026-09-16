-- Odentia Core — provision the first Clinic Admin of a Superadmin-
-- provisioned clinic (backend/DB only — no UI, no accept() change yet)
--
-- Part of the commercial provisioning initiative: Superadmin → provision_clinic()
-- → (this checkpoint) → invite the first clinic_admin → (next checkpoint)
-- password-only activation that writes the pre-provisioned identity into
-- profiles at acceptance time. This migration only adds storage +
-- issuance; accept_clinic_invitation() is deliberately untouched — these
-- new invitations stay `pending` until that follow-up checkpoint lands.
--
-- ============================================================
-- 1. clinic_invitations — pre-provisioned identity, additive/nullable
-- ============================================================
-- Nullable, not NOT NULL: every existing dentist/assistant invitation
-- (past and future, via invite_clinic_member()) never sets these and must
-- stay perfectly valid — this is purely additive storage for the NEW
-- Superadmin-issued flow this migration also creates, never a
-- requirement on the table itself. `email` already exists on this table
-- (foundation schema) — not duplicated here. Types match
-- public.profiles' own first_name/last_name/phone columns exactly
-- (profiles itself keeps first_name/last_name NOT NULL — that constraint
-- lives on profiles, not here, and stays completely untouched; nothing
-- is written to profiles by this migration at all).
alter table public.clinic_invitations
  add column first_name text,
  add column last_name text,
  add column phone text;

-- ============================================================
-- 2. provision_first_clinic_admin_invitation() — Superadmin-only
-- ============================================================
-- Deliberately NOT an extension of invite_clinic_member(): that RPC
-- resolves clinic_id from the CALLER's own active clinic_admin membership
-- (structurally impossible for a Superadmin, who has none by design — see
-- CLAUDE.md's Superadmin section) and hard-rejects role='clinic_admin'
-- outright. This is a separate, narrowly-scoped RPC for exactly one job:
-- bootstrapping the FIRST clinic_admin of an already-provisioned clinic —
-- never a general "invite anyone as anything" API. Once that first admin
-- exists, growing the team (dentist/assistant, and any later admin
-- beyond the first) remains her own job via the existing
-- invite_clinic_member(), unchanged.
--
-- Reuses the exact same token/hash convention as invite_clinic_member()/
-- regenerate_clinic_invitation() (pgcrypto gen_random_bytes(32) + sha256,
-- only the hash persisted, raw token returned once, 7-day expiry) and
-- writes into the SAME clinic_invitations table/lifecycle — never a
-- second invitation system. preview_clinic_invitation()/
-- accept_clinic_invitation() already work against any row in this table
-- regardless of which RPC created it; nothing here required changing
-- either (composite row types like public.clinic_invitations pick up new
-- columns automatically — no signature change needed elsewhere).
--
-- Authorization: is_platform_superadmin() only, checked first, before
-- any read or write of clinic_invitations. clinic_id is an explicit
-- parameter (the Superadmin names the target clinic — there is no
-- membership of hers to derive it from, same reasoning provision_clinic()
-- already established), and role is hardcoded 'clinic_admin' server-side
-- — never a parameter, so no caller can provision any other role through
-- this function no matter what it sends.
--
-- "First admin" guard, minimal interpretation, no invented states: a
-- clinic that already has an ACTIVE clinic_admin membership, or an
-- already-PENDING (unexpired) clinic_admin invitation, cannot get a
-- second one through this RPC — this function is only for the bootstrap
-- moment, not an ongoing multi-admin provisioning tool. Both checks are
-- scoped by clinic_id alone (never by the invited email), since the rule
-- is "this clinic's first admin slot," not "this specific person."
create function public.provision_first_clinic_admin_invitation(
  p_clinic_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text
)
returns table (
  id uuid,
  clinic_id uuid,
  email text,
  role public.membership_role,
  status public.invitation_status,
  expires_at timestamptz,
  raw_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_email text;
  v_raw_token text;
  v_token_hash text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'provision_first_clinic_admin_invitation requires an authenticated session';
  end if;

  -- The actual gate. Checked before anything else, including whether the
  -- clinic exists — a rejected caller learns nothing about clinic_id's
  -- validity either.
  if not public.is_platform_superadmin() then
    raise exception 'only a platform superadmin can provision a clinic''s first admin' using errcode = '42501';
  end if;

  -- The clinic must exist. This RPC never creates or modifies a clinic —
  -- that stays provision_clinic()'s own job.
  if not exists (select 1 from public.clinics c where c.id = p_clinic_id) then
    raise exception 'clinic not found';
  end if;

  -- Required for THIS flow specifically (the future password-only
  -- activation depends on all four being present) — enforced here, at
  -- the RPC level, not as a table constraint, so existing dentist/
  -- assistant invitations (which never set these) remain valid rows.
  v_first_name := nullif(btrim(p_first_name), '');
  v_last_name := nullif(btrim(p_last_name), '');
  v_phone := nullif(btrim(p_phone), '');
  if v_first_name is null then
    raise exception 'first_name must not be empty';
  end if;
  if v_last_name is null then
    raise exception 'last_name must not be empty';
  end if;
  if v_phone is null then
    raise exception 'phone must not be empty';
  end if;

  -- Same email normalization/format validation as invite_clinic_member().
  v_email := lower(btrim(p_email));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  -- First-admin guard, part 1: an active clinic_admin already exists.
  if exists (
    select 1 from public.clinic_memberships cm
    where cm.clinic_id = p_clinic_id and cm.role = 'clinic_admin' and cm.status = 'active'
  ) then
    raise exception 'this clinic already has an active clinic_admin';
  end if;

  -- First-admin guard, part 2: a pending, unexpired clinic_admin
  -- invitation already exists for this clinic (regardless of which
  -- email) — same "one live invitation for this slot" reasoning
  -- invite_clinic_member() already applies per-email; here the slot is
  -- the clinic's first-admin bootstrap itself.
  if exists (
    select 1 from public.clinic_invitations ci
    where ci.clinic_id = p_clinic_id
      and ci.role = 'clinic_admin'
      and ci.status = 'pending'
      and ci.expires_at > now()
  ) then
    raise exception 'this clinic already has a pending clinic_admin invitation';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '7 days';

  insert into public.clinic_invitations (
    clinic_id, email, role, invited_by, token_hash, status, expires_at,
    first_name, last_name, phone
  )
  values (
    p_clinic_id, v_email, 'clinic_admin', auth.uid(), v_token_hash, 'pending', v_expires_at,
    v_first_name, v_last_name, v_phone
  )
  returning public.clinic_invitations.id into v_invitation_id;

  return query
    select v_invitation_id, p_clinic_id, v_email, 'clinic_admin'::public.membership_role, 'pending'::public.invitation_status,
           v_expires_at, v_raw_token;
end;
$$;

revoke execute on function public.provision_first_clinic_admin_invitation(uuid, text, text, text, text) from public;
grant execute on function public.provision_first_clinic_admin_invitation(uuid, text, text, text, text) to authenticated;
-- Not granted to anon: provisioning always requires a real, authenticated
-- session — is_platform_superadmin() is the actual authorization
-- boundary; this grant only lets an authenticated call reach the
-- function body at all, same pattern as every other privileged RPC in
-- this schema (invite_clinic_member, provision_clinic, ...). No service
-- role, no auth.admin usage, no Auth user created, no email sent, no
-- write to profiles or clinic_memberships or professional_profiles —
-- this function only ever inserts one row into clinic_invitations.
