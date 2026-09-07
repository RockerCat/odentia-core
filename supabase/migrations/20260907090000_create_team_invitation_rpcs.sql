-- Odentia Core — Clínica → Equipo: invite/manage real clinic_memberships
--
-- clinic_memberships/professional_profiles/clinic_invitations already exist
-- (foundation schema, 20260824210644) with RLS deliberately closed on every
-- write for `authenticated` — the foundation RLS migration's own comments
-- call out exactly the three RPCs this migration adds: clinic_invitations
-- INSERT-with-checks is already covered by clinic_invitations_insert_admin,
-- but clinic_memberships INSERT/UPDATE and clinic_invitations UPDATE
-- (accept) have no policy at all yet, reserved for "a controlled RPC that
-- can check 'is this the last active admin' etc. as real application
-- logic, not a WITH CHECK expression." This migration is that RPC layer —
-- no new table, no new RLS policy on clinic_memberships/professional_profiles
-- (writes go through SECURITY DEFINER, which bypasses RLS on the function
-- owner's behalf; the deny-by-default policies stay exactly as strict for
-- any OTHER write path).
--
-- Token handling: pgcrypto's gen_random_bytes/digest for a real
-- cryptographic token — generated once, returned to the caller (the admin,
-- to copy/share manually), and NEVER stored in plain form, only its SHA-256
-- hash (token_hash, already a column on clinic_invitations). There is no
-- outbound email integration in this project yet (no service_role key, no
-- SMTP/email provider configured — see this task's own report) — sending
-- the invitation is therefore a manual step for the admin today, not
-- simulated as automatic.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- invite_clinic_member — admin creates a pending clinic_invitations row
-- ============================================================
-- clinic_id is NEVER a parameter — resolved from the caller's own active
-- clinic_admin membership, exactly like bootstrap_clinic resolves
-- profile_id from auth.uid() alone. This is what makes "admin of clinic A
-- invites someone into clinic B" structurally impossible, not just
-- policy-checked.
create function public.invite_clinic_member(
  p_email text,
  p_role public.membership_role
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
  v_raw_token text;
  v_token_hash text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'invite_clinic_member requires an authenticated session';
  end if;

  -- Only ever the caller's OWN clinic, and only while they're an ACTIVE
  -- clinic_admin there — has_clinic_role() re-derives this from
  -- clinic_memberships itself, never trusted from a client parameter.
  select m.clinic_id into v_clinic_id
  from public.clinic_memberships m
  where m.profile_id = auth.uid()
    and m.role = 'clinic_admin'
    and m.status = 'active'
  limit 1;

  if v_clinic_id is null then
    raise exception 'only an active clinic_admin can invite team members' using errcode = '42501';
  end if;

  -- Only Odontólogo/Asistente are ever offered by this flow — a second
  -- clinic_admin is a materially different, higher-privilege decision, not
  -- part of this task's scope.
  if p_role not in ('dentist', 'assistant') then
    raise exception 'invitations may only be created for dentist or assistant roles';
  end if;

  v_email := lower(btrim(p_email));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  -- Reject if this email already has an ACTIVE membership in this clinic —
  -- avoids inviting someone who's already on the team, and avoids a
  -- doomed invitation that would only fail later at acceptance time on the
  -- clinic_memberships unique(clinic_id, profile_id) constraint.
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

  -- Reject a second pending invitation for the same email in this clinic —
  -- one live invitation at a time, no silent duplicate tokens accumulating.
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

  insert into public.clinic_invitations (clinic_id, email, role, invited_by, token_hash, status, expires_at)
  values (v_clinic_id, v_email, p_role, auth.uid(), v_token_hash, 'pending', v_expires_at)
  returning public.clinic_invitations.id into v_invitation_id;

  return query
    select v_invitation_id, v_clinic_id, v_email, p_role, 'pending'::public.invitation_status, v_expires_at, v_raw_token;
end;
$$;

revoke execute on function public.invite_clinic_member(text, public.membership_role) from public;
grant execute on function public.invite_clinic_member(text, public.membership_role) to authenticated;
-- Not granted to anon: only an already-authenticated clinic_admin invites.


-- ============================================================
-- accept_clinic_invitation — the ONLY path that creates a real
-- clinic_memberships row from an invitation (never a bare client INSERT)
-- ============================================================
-- Works identically whether the accepting person is a brand-new Odentia
-- signup or an existing account — either way they must be authenticated,
-- under an email that matches the invitation, before this can succeed.
create function public.accept_clinic_invitation(p_token text)
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

  -- The single most important check here: only the person the admin
  -- actually invited can consume this token — never whoever happens to be
  -- logged in when the link is opened.
  if lower(v_caller_email) <> lower(v_invitation.email) then
    raise exception 'this invitation was sent to a different email address' using errcode = '42501';
  end if;

  -- Structural backstop is clinic_memberships' own
  -- unique(clinic_id, profile_id) constraint; this pre-check exists only
  -- to raise a clear, specific error instead of a raw unique_violation.
  if exists (
    select 1 from public.clinic_memberships
    where clinic_id = v_invitation.clinic_id and profile_id = auth.uid()
  ) then
    raise exception 'you already have a membership in this clinic';
  end if;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, invited_by, joined_at)
  values (v_invitation.clinic_id, auth.uid(), v_invitation.role, 'active', v_invitation.invited_by, now())
  returning public.clinic_memberships.id into v_membership_id;

  -- Odontólogo needs a real (if minimal) professional_profile to be
  -- clinically active right away — same bare-minimum row bootstrap_clinic
  -- already creates for an "Administrador Odontólogo" founder. Asistente
  -- never gets one (see CLAUDE.md Domain Model: never a clinical
  -- professional).
  if v_invitation.role = 'dentist' then
    insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
    values (v_membership_id, v_invitation.clinic_id, true)
    returning public.professional_profiles.id into v_professional_profile_id;
  end if;

  update public.clinic_invitations
  set status = 'accepted', accepted_membership_id = v_membership_id
  where id = v_invitation.id;

  return query select v_membership_id, v_invitation.clinic_id, v_invitation.role, v_professional_profile_id;
end;
$$;

revoke execute on function public.accept_clinic_invitation(text) from public;
grant execute on function public.accept_clinic_invitation(text) to authenticated;
-- Not granted to anon: consuming an invitation always requires being
-- authenticated first (sign up or log in), by design — see this task's
-- own report for the acceptance page's flow.


-- ============================================================
-- set_clinic_member_status — admin activates/deactivates an existing
-- clinic_memberships row
-- ============================================================
create function public.set_clinic_member_status(
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

  if not public.has_clinic_role(v_target.clinic_id, array['clinic_admin']::public.membership_role[]) then
    raise exception 'only an active clinic_admin can change a member''s status' using errcode = '42501';
  end if;

  v_new_status := case when p_active then 'active' else 'inactive' end;

  -- Deactivating a clinic_admin (self or another admin) must never leave
  -- the clinic with zero active admins — the one hard rule RLS alone can't
  -- express, per the foundation RLS migration's own note.
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

revoke execute on function public.set_clinic_member_status(uuid, boolean) from public;
grant execute on function public.set_clinic_member_status(uuid, boolean) to authenticated;
