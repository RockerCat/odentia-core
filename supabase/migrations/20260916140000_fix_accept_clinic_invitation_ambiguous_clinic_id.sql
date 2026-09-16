-- Odentia Core — fix accept_clinic_invitation's ambiguous "clinic_id"
-- (again — see below for exactly how this regressed)
--
-- Root cause, captured directly from a real, reproduced failure (real
-- pending invitation, Muelitas7, role assistant, authenticated as the
-- invited email) via temporary diagnostic logging on the client
-- (Checkpoint 1C.1/1C.2) — not guessed:
--
--   code: 42702
--   message: column reference "clinic_id" is ambiguous
--   details: It could refer to either a PL/pgSQL variable or a table column.
--
-- This EXACT bug was already found and fixed once before, in
-- 20260909020000_fix_accept_clinic_invitation_ambiguous_clinic_id.sql:
-- accept_clinic_invitation's own `returns table (membership_id uuid,
-- clinic_id uuid, role ..., professional_profile_id uuid)` creates an
-- implicit PL/pgSQL OUT variable per output column, so any BARE
-- "clinic_id" in the function body is ambiguous against
-- clinic_memberships' own clinic_id column — Postgres rejects it outright
-- rather than guessing. That migration aliased the one offending query
-- (`cm.clinic_id`/`cm.profile_id`).
--
-- It silently REGRESSED five days later: 20260914090000_seed_default_
-- professional_availability.sql also did a `create or replace function
-- public.accept_clinic_invitation(...)` (to add the
-- seed_default_professional_availability() call for a newly-invited
-- dentist) — but its own copy of the function body was taken from the
-- ORIGINAL, PRE-FIX version (20260907090000), not the already-fixed one
-- from 20260909020000. `CREATE OR REPLACE` has no way to warn about this
-- — it happily overwrote the fixed body with the pre-fix one, since the
-- signature was identical either way. This made EVERY team invitation
-- acceptance fail again, unconditionally, exactly as before — until this
-- migration.
--
-- Verified this is the ONLY bare, ambiguous reference left anywhere in
-- the current function body (checked every other statement individually
-- — INSERT/UPDATE target column lists like `insert into
-- clinic_memberships (clinic_id, ...)` are resolved as columns of the
-- target table by Postgres's own grammar, never against PL/pgSQL variable
-- scope, so those were never actually at risk despite also containing the
-- bare word "clinic_id"; every other reference is already qualified via
-- v_invitation.clinic_id or fully-qualified column names). Fix, once
-- again: alias the table in the one EXISTS query that was bare — no other
-- change.
--
-- Diff from the currently-live body is exactly this one qualification —
-- same signature, same SECURITY DEFINER, same search_path, same
-- authorization/session/token/status/expiry/email checks, same
-- membership INSERT, same dentist-only professional_profile +
-- availability seed, same assistant behavior (no professional_profile),
-- same invitation→accepted update, same return shape, same grants
-- (CREATE OR REPLACE against the identical signature preserves the
-- existing EXECUTE grant — not restated here, matching this repo's own
-- convention of only restating grants when a signature actually changes).
--
-- The separate, real, already-known issue where the `expired`-branch's
-- own UPDATE gets rolled back by the RAISE EXCEPTION immediately after it
-- is NOT touched here — out of scope for this fix, tracked separately.
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

  if v_invitation.role = 'dentist' then
    insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
    values (v_membership_id, v_invitation.clinic_id, true)
    returning public.professional_profiles.id into v_professional_profile_id;

    perform public.seed_default_professional_availability(v_professional_profile_id, v_invitation.clinic_id);
  end if;

  update public.clinic_invitations
  set status = 'accepted', accepted_membership_id = v_membership_id
  where id = v_invitation.id;

  return query select v_membership_id, v_invitation.clinic_id, v_invitation.role, v_professional_profile_id;
end;
$$;
