-- Odentia Core — Platform → Clínica → Equipo: gestión transversal por
-- Superadmin
--
-- Closes the real gap found in the previous focused audit:
-- invite_clinic_member() (20260907090000) can never serve a Superadmin —
-- it derives clinic_id EXCLUSIVELY from the caller's own active
-- clinic_admin membership, which a Superadmin structurally never has, and
-- it hardcodes dentist/assistant only. Rather than widen that function
-- (which would mix two different clinic_id-resolution strategies and two
-- different role restrictions inside one body every existing Clinic
-- Admin already depends on daily), this migration adds a SEPARATE,
-- narrowly-scoped RPC — same reasoning already established by
-- provision_first_clinic_admin_invitation() (20260916150000) for exactly
-- this class of problem.
--
-- provision_first_clinic_admin_invitation() is UNTOUCHED by this
-- migration and keeps its own special "bootstrap the first admin" guards
-- (reject if an active admin already exists, reject if a pending
-- clinic_admin invitation already exists) — those guards are specific to
-- the bootstrap moment and do not apply to ongoing team management.
-- Multiple `clinic_admin` memberships per clinic ARE allowed by product
-- decision (confirmed) and by schema (no uniqueness constraint on role) —
-- provision_clinic_team_member() below never re-applies the first-admin
-- guards.
--
-- Both RPCs write into the SAME clinic_invitations table/lifecycle and
-- are both accepted by the SAME accept_clinic_invitation() — never two
-- invitation systems. accept_clinic_invitation() itself needs NO changes:
-- confirmed by inspection that its identity/professional_profile handling
-- is already fully role-generic (clinic_admin/assistant never get a
-- professional_profile; dentist always does, with the availability seed;
-- the phone sync only ever checks "does this invitation carry a phone",
-- never a role) — this migration does not touch it, and this comment
-- documents that the 42702 fix (cm.clinic_id/cm.profile_id, see
-- 20260916140000) stays exactly as deployed, unregressed.
--
-- ============================================================
-- 1. provision_clinic_team_member() — Superadmin-only, any of the three
--    real membership roles, always with complete pre-provisioned identity
-- ============================================================
-- Same token/hash convention as every other invitation in this schema
-- (pgcrypto gen_random_bytes(32) + sha256, only the hash persisted, raw
-- token returned exactly once, 7-day expiry). Product decision (this
-- checkpoint): EVERY Platform-issued invitation, regardless of role,
-- captures complete identity (first_name/last_name/phone) so a genuinely
-- new user always gets the password-only, no-Confirm-Signup activation —
-- never role-conditional identity capture the way the Clinic Admin's own
-- invite_clinic_member() is (that one never asks for these at all, by
-- design, for its own dentist/assistant-only flow — unchanged).
create function public.provision_clinic_team_member(
  p_clinic_id uuid,
  p_role public.membership_role,
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
  v_existing_status public.membership_status;
begin
  if auth.uid() is null then
    raise exception 'provision_clinic_team_member requires an authenticated session';
  end if;

  -- The actual gate, checked first, before any other read or write — a
  -- rejected caller learns nothing else about this clinic.
  if not public.is_platform_superadmin() then
    raise exception 'only a platform superadmin can provision a clinic team member' using errcode = '42501';
  end if;

  -- membership_role has no other values today, but this is asserted
  -- explicitly rather than assumed — the DB type is not, by itself, this
  -- RPC's authorization boundary for "which roles Platform may issue".
  if p_role not in ('clinic_admin', 'dentist', 'assistant') then
    raise exception 'role must be clinic_admin, dentist, or assistant';
  end if;

  if not exists (select 1 from public.clinics c where c.id = p_clinic_id) then
    raise exception 'clinic not found';
  end if;

  -- Required for every Platform invitation regardless of role — see this
  -- migration's own header comment. Enforced here, at the RPC level, not
  -- as a table constraint, so invite_clinic_member()'s own rows (which
  -- never set these) remain valid.
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

  -- Same email normalization/format validation as invite_clinic_member()/
  -- provision_first_clinic_admin_invitation().
  v_email := lower(btrim(p_email));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  -- Existing membership for this email in THIS clinic, any role, any
  -- status — clinic_memberships' own unique(clinic_id, profile_id)
  -- constraint means a profile can only ever have ONE membership row per
  -- clinic, so this is the complete, correct duplicate check (never
  -- scoped to "same role" — a person cannot become a second, different
  -- role in the same clinic through this or any other path). Distinct
  -- messages so the caller can offer the right recovery action instead
  -- of a doomed invitation:
  --   active      → this person is already on the team, nothing to do.
  --   any other   → a membership already exists but isn't active
  --                 (inactive/suspended) — the fix is
  --                 set_clinic_member_status(membership_id, true)
  --                 (reactivation), never a new invitation, which would
  --                 later fail at accept_clinic_invitation()'s own
  --                 "you already have a membership in this clinic" check.
  select cm.status into v_existing_status
  from public.clinic_memberships cm
  join public.profiles p on p.id = cm.profile_id
  where cm.clinic_id = p_clinic_id and lower(p.email) = v_email
  limit 1;

  if v_existing_status = 'active' then
    raise exception 'this person is already an active member of this clinic';
  end if;
  if v_existing_status is not null then
    raise exception 'this person already has an inactive membership in this clinic; use reactivation instead of a new invitation';
  end if;

  -- Reject a second pending invitation for the same email in this
  -- clinic — same "one live invitation at a time" rule
  -- invite_clinic_member() already applies, never filtered by
  -- invited_by: a pending invitation issued by the Clinic Admin and one
  -- issued by a Superadmin for the same email/clinic must conflict with
  -- each other exactly the same way two Clinic-Admin-issued ones would.
  if exists (
    select 1
    from public.clinic_invitations ci
    where ci.clinic_id = p_clinic_id
      and lower(ci.email) = v_email
      and ci.status = 'pending'
      and ci.expires_at > now()
  ) then
    raise exception 'there is already a pending invitation for this email in this clinic';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '7 days';

  -- Only ever an INSERT into clinic_invitations — no clinic_membership,
  -- no professional_profile, no Auth user. Those are created later,
  -- exclusively by the Auth Admin API (a genuinely new user's password-
  -- only activation) and accept_clinic_invitation() (membership + its
  -- role-conditional professional_profile), never here.
  insert into public.clinic_invitations (
    clinic_id, email, role, invited_by, token_hash, status, expires_at,
    first_name, last_name, phone
  )
  values (
    p_clinic_id, v_email, p_role, auth.uid(), v_token_hash, 'pending', v_expires_at,
    v_first_name, v_last_name, v_phone
  )
  returning public.clinic_invitations.id into v_invitation_id;

  return query
    select v_invitation_id, p_clinic_id, v_email, p_role, 'pending'::public.invitation_status,
           v_expires_at, v_raw_token;
end;
$$;

revoke execute on function public.provision_clinic_team_member(uuid, public.membership_role, text, text, text, text) from public;
grant execute on function public.provision_clinic_team_member(uuid, public.membership_role, text, text, text, text) to authenticated;
-- Not granted to anon: provisioning always requires a real, authenticated
-- session — is_platform_superadmin() is the actual authorization
-- boundary; this grant only lets an authenticated call reach the
-- function body at all, same pattern as every other privileged RPC in
-- this schema.

-- ============================================================
-- 2. regenerate_clinic_invitation() — widen authorization only
-- ============================================================
-- Based on the CURRENT deployed body (20260914110000, never replaced
-- since) — not an older cached copy. This is the exact lesson called out
-- after the 42702 regression (20260916140000's own header comment):
-- always start a CREATE OR REPLACE from the version actually live today.
-- Every line below is identical to 20260914110000 except the single
-- authorization check, which now also accepts a platform Superadmin —
-- clinic_id is already resolved from the INVITATION's own row (never a
-- caller-supplied one), which is exactly what makes this widening safe:
-- a Superadmin regenerating a link still only ever affects the specific
-- invitation she named, in whatever clinic it actually belongs to.
create or replace function public.regenerate_clinic_invitation(p_invitation_id uuid)
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
  v_invitation public.clinic_invitations;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'regenerate_clinic_invitation requires an authenticated session';
  end if;

  select * into v_invitation
  from public.clinic_invitations
  where public.clinic_invitations.id = p_invitation_id
  for update;

  if v_invitation.id is null then
    raise exception 'invitation not found';
  end if;

  if not (
    public.has_clinic_role(v_invitation.clinic_id, array['clinic_admin']::public.membership_role[])
    or public.is_platform_superadmin()
  ) then
    raise exception 'only an active clinic_admin of this clinic (or a platform superadmin) can regenerate this invitation' using errcode = '42501';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'only a pending invitation can be regenerated';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '7 days';

  update public.clinic_invitations
  set token_hash = v_token_hash,
      expires_at = v_expires_at
  where public.clinic_invitations.id = p_invitation_id
    and public.clinic_invitations.status = 'pending';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'invitation was not in a regenerable state at update time';
  end if;

  return query
    select v_invitation.id, v_invitation.clinic_id, v_invitation.email, v_invitation.role, v_invitation.status, v_expires_at, v_raw_token;
end;
$$;
-- Grants unchanged (already `authenticated`, never `anon`, from
-- 20260914110000) — CREATE OR REPLACE never resets existing grants.

-- ============================================================
-- 3. set_clinic_member_status() — widen authorization only
-- ============================================================
-- Based on the CURRENT deployed body (20260907090000, never replaced
-- since). Same reasoning as regenerate_clinic_invitation() above:
-- clinic_id is resolved from the TARGET membership row itself (never a
-- caller-supplied one), so widening only the authorization check is
-- safe — a Superadmin can only ever change the status of the specific
-- membership she named, in whatever clinic it actually belongs to. The
-- last-active-admin guard is completely untouched and applies identically
-- regardless of who is calling.
create or replace function public.set_clinic_member_status(
  p_membership_id uuid,
  p_active boolean
)
returns public.clinic_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.clinic_memberships;
  v_active_admin_count integer;
  v_new_status public.membership_status;
begin
  if auth.uid() is null then
    raise exception 'set_clinic_member_status requires an authenticated session';
  end if;

  select * into v_target from public.clinic_memberships where id = p_membership_id;
  if v_target.id is null then
    raise exception 'membership not found';
  end if;

  if not (
    public.has_clinic_role(v_target.clinic_id, array['clinic_admin']::public.membership_role[])
    or public.is_platform_superadmin()
  ) then
    raise exception 'only an active clinic_admin of this clinic (or a platform superadmin) can change a member''s status' using errcode = '42501';
  end if;

  v_new_status := case when p_active then 'active' else 'inactive' end;

  -- Deactivating a clinic_admin (self or another admin) must never leave
  -- the clinic with zero active admins — unchanged, applies identically
  -- to a Superadmin caller.
  if not p_active and v_target.role = 'clinic_admin' and v_target.status = 'active' then
    select count(*) into v_active_admin_count
    from public.clinic_memberships
    where clinic_id = v_target.clinic_id
      and role = 'clinic_admin'
      and status = 'active';

    if v_active_admin_count <= 1 then
      raise exception 'cannot deactivate the last active admin of this clinic';
    end if;
  end if;

  update public.clinic_memberships
  set status = v_new_status
  where id = p_membership_id
  returning * into v_target;

  return v_target;
end;
$$;
-- Grants unchanged (already `authenticated`, never `anon`, from
-- 20260907090000) — CREATE OR REPLACE never resets existing grants.
