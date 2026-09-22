-- Odentia Core — unify Clinic-Admin-issued Equipo invitations with
-- pre-provisioned identity, closing the last real caller of
-- auth.signUp()/Confirm Signup outside /registro.
--
-- Context: invite_clinic_member() (20260907090000) is the ONLY invitation
-- RPC that never captured first_name/last_name/phone — every
-- Superadmin-issued invitation (provision_first_clinic_admin_invitation(),
-- 20260916150000; provision_clinic_team_member(), 20260916180000) already
-- requires complete identity, which is what lets a genuinely new person
-- activate by password only (admin.createUser + email_confirm=true,
-- activatePreProvisionedInvitationAction()) instead of the public
-- auth.signUp() + Confirm Signup email round trip. This migration brings
-- a Clinic Admin's own "Agregar miembro" flow up to that same bar — same
-- token/hash/expiry mechanism, same clinic_invitations table, same
-- accept_clinic_invitation() as the ONLY thing that ever creates a real
-- membership. Never a second invitation system.
--
-- Nothing downstream needs to change: preview_clinic_invitation() already
-- returns first_name/last_name/phone generically for ANY invitation row
-- (20260916160000); hasPreProvisionedIdentity() (team-actions.ts) and
-- activatePreProvisionedInvitationAction() are both already role/source-
-- agnostic (no invited_by or role check — see that action's own
-- comment) — they act on identity-completeness alone. Once this RPC
-- starts persisting the three columns, a brand-new Clinic-Admin-issued
-- invitation automatically qualifies for the exact same password-only
-- activation path, with zero changes to the acceptance UI or
-- accept_clinic_invitation() itself.
--
-- DROP + CREATE, not CREATE OR REPLACE: adding required parameters is a
-- different signature, not a body replacement of the existing 2-arg
-- overload — CREATE OR REPLACE would leave BOTH signatures callable
-- (the old, identity-less one included), which is exactly the second/
-- lingering flow this checkpoint exists to remove. The 2-arg overload is
-- explicitly dropped first so it can never be called again.
drop function public.invite_clinic_member(text, public.membership_role);

create function public.invite_clinic_member(
  p_email text,
  p_role public.membership_role,
  p_first_name text,
  p_last_name text,
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
  v_clinic_id uuid;
  v_email text;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_raw_token text;
  v_token_hash text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'invite_clinic_member requires an authenticated session';
  end if;

  -- Unchanged: only ever the caller's OWN clinic, and only while they're
  -- an ACTIVE clinic_admin there.
  select m.clinic_id into v_clinic_id
  from public.clinic_memberships m
  where m.profile_id = auth.uid()
    and m.role = 'clinic_admin'
    and m.status = 'active'
  limit 1;

  if v_clinic_id is null then
    raise exception 'only an active clinic_admin can invite team members' using errcode = '42501';
  end if;

  -- Unchanged: this checkpoint does not widen which roles a Clinic Admin
  -- may invite through her own Equipo flow — a second clinic_admin stays
  -- a materially different decision, out of scope here exactly as before.
  if p_role not in ('dentist', 'assistant') then
    raise exception 'invitations may only be created for dentist or assistant roles';
  end if;

  v_email := lower(btrim(p_email));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  -- Required for every invitation now, regardless of who issues it — same
  -- validation, same error strings, as provision_clinic_team_member()
  -- (20260916180000), so the client's existing friendly-error mapping for
  -- that RPC applies verbatim here too.
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

  -- Unchanged: reject if this email already has an ACTIVE membership in
  -- this clinic.
  if exists (
    select 1
    from public.clinic_memberships m
    join public.profiles p on p.id = m.profile_id
    where m.clinic_id = v_clinic_id
      and m.status = 'active'
      and lower(p.email) = v_email
  ) then
    raise exception 'this person is already an active member of your clinic';
  end if;

  -- Unchanged: reject a second pending invitation for the same email in
  -- this clinic.
  if exists (
    select 1
    from public.clinic_invitations ci
    where ci.clinic_id = v_clinic_id
      and lower(ci.email) = v_email
      and ci.status = 'pending'
      and ci.expires_at > now()
  ) then
    raise exception 'there is already a pending invitation for this email';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_expires_at := now() + interval '7 days';

  insert into public.clinic_invitations (
    clinic_id, email, role, invited_by, token_hash, status, expires_at,
    first_name, last_name, phone
  )
  values (
    v_clinic_id, v_email, p_role, auth.uid(), v_token_hash, 'pending', v_expires_at,
    v_first_name, v_last_name, v_phone
  )
  returning public.clinic_invitations.id into v_invitation_id;

  return query
    select v_invitation_id, v_clinic_id, v_email, p_role, 'pending'::public.invitation_status, v_expires_at, v_raw_token;
end;
$$;

revoke execute on function public.invite_clinic_member(text, public.membership_role, text, text, text) from public;
grant execute on function public.invite_clinic_member(text, public.membership_role, text, text, text) to authenticated;
-- Not granted to anon: only an already-authenticated clinic_admin invites.
