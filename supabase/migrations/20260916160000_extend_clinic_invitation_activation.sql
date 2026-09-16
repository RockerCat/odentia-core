-- Odentia Core — password-only activation for a pre-provisioned first
-- Clinic Admin (Checkpoint 3)
--
-- Two changes, both scoped to exactly what this checkpoint needs:
--   1. preview_clinic_invitation() also exposes first_name/last_name/
--      phone, so the token holder can render the pre-provisioned
--      identity/clinic/role before ever creating an account.
--   2. accept_clinic_invitation() syncs a pre-provisioned phone into the
--      accepting profile, conservatively — never anything else.
--
-- Neither change touches the invitation lifecycle, membership creation,
-- or professional_profile logic already fixed/validated in prior
-- checkpoints (20260916140000's own 42702 fix is preserved verbatim
-- below — cm.clinic_id/cm.profile_id stay aliased).

-- ============================================================
-- 1. preview_clinic_invitation — add first_name/last_name/phone
-- ============================================================
-- DROP + CREATE, not CREATE OR REPLACE: Postgres does not allow changing
-- an existing function's RETURNS TABLE shape via CREATE OR REPLACE (see
-- 20260916130000's own comment on this exact same constraint) — the input
-- signature (p_token text) is unchanged, so this cannot leave a second,
-- divergent overload behind.
--
-- Still the only anon-grantable custom RPC in this schema, still
-- read-only, still keyed exclusively by the raw token (never by email —
-- no new lookup path, no enumeration surface added). first_name/
-- last_name/phone are exactly the three columns
-- provision_first_clinic_admin_invitation() (20260916150000) persists —
-- returned here as-is, still never token_hash/invited_by/
-- accepted_membership_id/id/clinic_id/any Auth identifier. For a
-- traditional dentist/assistant invitation (first_name/last_name/phone
-- all null in the row) these simply come back null — the page's own
-- branch on "is this a pre-provisioned clinic_admin invitation with a
-- complete identity" already has everything it needs from that.
drop function public.preview_clinic_invitation(text);

create function public.preview_clinic_invitation(p_token text)
returns table (
  status public.invitation_status,
  usable boolean,
  email text,
  role public.membership_role,
  clinic_name text,
  user_exists boolean,
  first_name text,
  last_name text,
  phone text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_hash text;
  v_invitation public.clinic_invitations;
  v_effective_status public.invitation_status;
  v_clinic_name text;
  v_user_exists boolean;
begin
  v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

  select * into v_invitation
  from public.clinic_invitations
  where public.clinic_invitations.token_hash = v_token_hash;

  if v_invitation.id is null then
    return query
      select null::public.invitation_status, false, null::text, null::public.membership_role, null::text, false,
             null::text, null::text, null::text;
    return;
  end if;

  v_effective_status := v_invitation.status;
  if v_effective_status = 'pending' and v_invitation.expires_at <= now() then
    v_effective_status := 'expired';
  end if;

  select c.name into v_clinic_name from public.clinics c where c.id = v_invitation.clinic_id;

  select exists (
    select 1 from public.profiles p where lower(p.email) = lower(v_invitation.email)
  ) into v_user_exists;

  return query
    select
      v_effective_status,
      v_effective_status = 'pending',
      v_invitation.email,
      v_invitation.role,
      v_clinic_name,
      v_user_exists,
      v_invitation.first_name,
      v_invitation.last_name,
      v_invitation.phone;
end;
$$;

revoke execute on function public.preview_clinic_invitation(text) from public;
grant execute on function public.preview_clinic_invitation(text) to anon, authenticated;

-- ============================================================
-- 2. accept_clinic_invitation — conservative phone sync only
-- ============================================================
-- Everything above the new block below is copied verbatim from
-- 20260916140000 (the 42702 fix) — including the aliased
-- cm.clinic_id/cm.profile_id pre-check, which this migration does NOT
-- touch or regress again.
--
-- first_name/last_name are deliberately NOT synced here: public.profiles
-- has them NOT NULL (foundation schema), and handle_new_user() already
-- populates them correctly at signup time from whatever
-- signUpAccount()'s own options.data sent (which, for the new
-- password-only activation flow, is the invitation's own first_name/
-- last_name — see the client-side change in this same checkpoint) — by
-- the time accept_clinic_invitation() ever runs, a brand-new profile
-- already has the right values, and an EXISTING profile already has its
-- own real ones. There is nothing here to "fill in" for either case, and
-- forcing a rewrite would risk exactly the "overwrite an existing user's
-- real identity" outcome this checkpoint must avoid.
--
-- phone IS synced, conservatively: public.profiles.phone is nullable and
-- no signup path (handle_new_user's own metadata handling) has ever
-- written it — there is no other mechanism that could get a
-- pre-provisioned phone number into a brand-new profile. The condition
-- is entirely server-side and demonstrable, never a client-supplied
-- flag: only fires when the invitation itself actually carries a phone
-- (null for every traditional dentist/assistant invitation — this whole
-- block is a no-op for cases C/D), and only ever fills the accepting
-- profile's phone when it is CURRENTLY null — an existing user's own
-- already-set phone number is never touched, regardless of what the
-- invitation says.
create or replace function public.accept_clinic_invitation(p_token text)
returns table (
  membership_id uuid,
  clinic_id uuid,
  role public.membership_role,
  professional_profile_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_hash text;
  v_invitation public.clinic_invitations;
  v_caller_email text;
  v_membership_id uuid;
  v_professional_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'accept_clinic_invitation requires an authenticated session';
  end if;

  select p.email into v_caller_email from public.profiles p where p.id = auth.uid();
  if v_caller_email is null then
    raise exception 'no profile found for the authenticated user';
  end if;

  v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

  select * into v_invitation
  from public.clinic_invitations
  where token_hash = v_token_hash;

  if v_invitation.id is null then
    raise exception 'this invitation link is not valid';
  end if;

  if v_invitation.status = 'accepted' then
    raise exception 'this invitation was already accepted';
  end if;
  if v_invitation.status = 'revoked' then
    raise exception 'this invitation was revoked';
  end if;
  if v_invitation.status = 'expired' or v_invitation.expires_at <= now() then
    if v_invitation.status <> 'expired' then
      update public.clinic_invitations set status = 'expired' where id = v_invitation.id;
    end if;
    raise exception 'this invitation has expired';
  end if;

  if lower(v_caller_email) <> lower(v_invitation.email) then
    raise exception 'this invitation was sent to a different email address' using errcode = '42501';
  end if;

  -- Structural backstop is clinic_memberships' own
  -- unique(clinic_id, profile_id) constraint; this pre-check exists only
  -- to raise a clear, specific error instead of a raw unique_violation.
  -- Aliased (cm.clinic_id/cm.profile_id) — bare "clinic_id" here is
  -- ambiguous against this function's own RETURNS TABLE column of the
  -- same name (see 20260916140000's own header comment — preserved here
  -- verbatim, never regressed).
  if exists (
    select 1 from public.clinic_memberships cm
    where cm.clinic_id = v_invitation.clinic_id and cm.profile_id = auth.uid()
  ) then
    raise exception 'you already have a membership in this clinic';
  end if;

  -- role is whatever the invitation carries — clinic_admin flows through
  -- exactly like dentist/assistant always have, no special-casing needed
  -- here; the professional_profile branch just below is the only
  -- role-conditional logic in this function.
  insert into public.clinic_memberships (clinic_id, profile_id, role, status, invited_by, joined_at)
  values (v_invitation.clinic_id, auth.uid(), v_invitation.role, 'active', v_invitation.invited_by, now())
  returning public.clinic_memberships.id into v_membership_id;

  if v_invitation.role = 'dentist' then
    insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
    values (v_membership_id, v_invitation.clinic_id, true)
    returning public.professional_profiles.id into v_professional_profile_id;

    perform public.seed_default_professional_availability(v_professional_profile_id, v_invitation.clinic_id);
  end if;
  -- Deliberately no branch for clinic_admin here: clinic_admin and
  -- clinical capacity stay independent concepts (see CLAUDE.md Domain
  -- Model) — a Clinic Admin who also practices self-creates her own
  -- professional_profile later via the existing, unrelated
  -- create_my_professional_profile().

  -- Conservative phone sync — see this migration's own header comment
  -- for the full reasoning. No-op for every traditional dentist/
  -- assistant invitation (v_invitation.phone is null there) and for any
  -- existing profile that already has a phone number.
  if v_invitation.phone is not null then
    update public.profiles
    set phone = v_invitation.phone
    where id = auth.uid() and phone is null;
  end if;

  update public.clinic_invitations
  set status = 'accepted', accepted_membership_id = v_membership_id
  where id = v_invitation.id;

  return query select v_membership_id, v_invitation.clinic_id, v_invitation.role, v_professional_profile_id;
end;
$$;
