-- Odentia Core — fix accept_clinic_invitation's ambiguous "clinic_id"
--
-- Root cause, confirmed live against production (a real invitation
-- acceptance failed with the exact Postgres error below, not guessed):
--
--   accept_clinic_invitation returns table (membership_id uuid,
--   clinic_id uuid, role ..., professional_profile_id uuid) — a
--   RETURNS TABLE clause creates an implicit PL/pgSQL variable per
--   column, so a bare "clinic_id" anywhere in the function body is
--   ambiguous between that OUT variable and any table column of the
--   same name. Every other query in this file already aliases the
--   table it queries (m.clinic_id, ci.clinic_id — see
--   invite_clinic_member in the same original migration); the one spot
--   that didn't was accept_clinic_invitation's own pre-check:
--
--     where clinic_id = v_invitation.clinic_id and profile_id = auth.uid()
--
--   which Postgres rejected outright:
--     ERROR 42702: column reference "clinic_id" is ambiguous
--     DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--
-- This made EVERY team invitation acceptance fail, unconditionally —
-- the function never got past this pre-check for anyone, regardless of
-- role or clinic. Fix: alias the table, matching this file's own
-- established convention everywhere else. No other behavior changes —
-- same signature, same checks, same order.
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

  -- The single most important check here: only the person the admin
  -- actually invited can consume this token — never whoever happens to be
  -- logged in when the link is opened.
  if lower(v_caller_email) <> lower(v_invitation.email) then
    raise exception 'this invitation was sent to a different email address' using errcode = '42501';
  end if;

  -- Structural backstop is clinic_memberships' own
  -- unique(clinic_id, profile_id) constraint; this pre-check exists only
  -- to raise a clear, specific error instead of a raw unique_violation.
  -- Aliased (cm.clinic_id/cm.profile_id) — bare "clinic_id" here is
  -- ambiguous against this function's own RETURNS TABLE column of the
  -- same name (see this migration's own header comment).
  if exists (
    select 1 from public.clinic_memberships cm
    where cm.clinic_id = v_invitation.clinic_id and cm.profile_id = auth.uid()
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
