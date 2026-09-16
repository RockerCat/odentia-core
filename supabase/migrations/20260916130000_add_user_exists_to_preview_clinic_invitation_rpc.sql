-- Odentia Core — preview_clinic_invitation(): add user_exists
--
-- Real smoke finding (Checkpoint 1B): a valid invitation issued to
-- alexsosa.me@gmail.com — an email that already has a real Odentia
-- account — still showed /invitacion/[token]'s "Crea tu cuenta" form
-- (name/apellido/email/password), because the previous preview payload
-- had no way to tell the page "this identity already exists." This
-- migration adds exactly that one boolean, nothing else.
--
-- DROP + CREATE, not CREATE OR REPLACE: Postgres does not allow changing
-- an existing function's RETURNS TABLE shape via CREATE OR REPLACE — only
-- the body may change that way, never the output column list (this is
-- documented Postgres behavior, not a project convention) — attempting it
-- raises "cannot change return type of existing function". The input
-- signature (`p_token text`, one argument) is completely unchanged here,
-- so — unlike bootstrap_clinic()'s own two-overload history (see
-- 20260916090000's comment on that) — this DROP + CREATE cannot leave a
-- second, divergent overload behind: there is only ever one
-- preview_clinic_invitation(text), before and after this migration.
-- Self-contained: the DROP and the new CREATE + its own GRANT/REVOKE all
-- happen in this one transaction, so there is no window where the
-- function is missing, differently-permissioned, or double-defined.
--
-- Security principle preserved exactly: input is still ONLY p_token —
-- never p_email, never any client-supplied identity claim. There is no
-- generic "does this email have an account" lookup here; user_exists is
-- derived entirely from the email the SERVER already resolved off the
-- token itself, the same way clinic_name/role/status already were.
-- Knowing a valid token is what authorizes seeing this one boolean about
-- THAT token's own invited email — nothing a client could use to probe
-- an arbitrary address.
--
-- Source for user_exists: public.profiles, not auth.users directly.
-- handle_new_user() (foundation schema, on_auth_user_created trigger)
-- inserts exactly one profiles row for every auth.users row, in the same
-- transaction as signup — profiles is therefore a reliable, real-time,
-- 1:1 mirror of Auth identity, the exact same source
-- invite_clinic_member()'s own existing-member duplicate check already
-- trusts (see that migration: `join public.profiles p on p.id =
-- m.profile_id`). No new table, no mirrored data, no direct auth.users
-- read.
--
-- Payload stays minimal: no auth user id, no profile id, no Auth
-- metadata/timestamps/providers, no membership/role information beyond
-- what this RPC already exposed. user_exists is a plain boolean, nothing
-- more.
drop function public.preview_clinic_invitation(text);

create function public.preview_clinic_invitation(p_token text)
returns table (
  status public.invitation_status,
  usable boolean,
  email text,
  role public.membership_role,
  clinic_name text,
  user_exists boolean
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

  -- Not found: identical shape to before, plus user_exists = false —
  -- never meaningful on this branch (usable is already false; the page
  -- must never read user_exists without usable also being true).
  if v_invitation.id is null then
    return query select null::public.invitation_status, false, null::text, null::public.membership_role, null::text, false;
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
      v_user_exists;
end;
$$;

revoke execute on function public.preview_clinic_invitation(text) from public;
grant execute on function public.preview_clinic_invitation(text) to anon, authenticated;
-- Restated exactly as before this migration: anon (still required, still
-- the only anon-grantable custom RPC in this schema) + authenticated,
-- EXECUTE only. No direct SELECT granted anywhere on clinic_invitations,
-- profiles, clinics, or auth.users — this function remains the only path.
