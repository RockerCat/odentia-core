-- Odentia Core — Clínica → Equipo: regenerate a still-pending invitation's
-- link
--
-- Problem this closes: clinic_invitations.token_hash (20260824210644) is,
-- by design, the ONLY thing ever persisted for a token — the raw token
-- itself only ever exists in invite_clinic_member()'s own return value
-- (20260907090000), for the admin to copy right then. There is therefore
-- structurally no way to recover an already-issued link later (expired,
-- lost, or never copied the first time) — this RPC is the sanctioned way
-- to give that pending invitation a brand-new, copyable link instead of
-- ever trying to reconstruct the old one.
--
-- Same shape/conventions as invite_clinic_member()/accept_clinic_invitation()
-- in that migration: SECURITY DEFINER, pgcrypto for a real random token +
-- its sha256 hash, 7-day expiry (same literal duration invite_clinic_member
-- already uses — "la duración ya usada por el sistema"), raw token
-- returned to the caller only, never stored.
--
-- UPDATEs the SAME clinic_invitations row in place (same id, same email/
-- role/invited_by/clinic_id/status='pending') rather than revoking-and-
-- inserting a second row — there is no existing "revoke" RPC/pattern to
-- follow yet (see that migration's own comment: "Revoking is the same
-- story — reserved for that future RPC"), and a second row would leave an
-- orphaned original invitation with no real column to represent "why does
-- this pending row no longer matter" other than a revoke this task didn't
-- ask for. Updating in place also gets token invalidation for free: since
-- token_hash carries clinic_invitations_token_hash_key (unique), the
-- moment this UPDATE commits, the previous raw token no longer hashes to
-- anything any row in this table holds — accept_clinic_invitation()'s own
-- token_hash lookup finds nothing for it and answers exactly like any
-- other unknown token ("this invitation link is not valid"), with no new
-- code needed there. clinic_invitations has no updated_at column (see the
-- foundation schema) — nothing to set here, per the task's own "si existe".
--
-- Authorization: only an active clinic_admin of the SAME clinic the
-- invitation belongs to — public.has_clinic_role(), the exact helper
-- invite_clinic_member/set_clinic_member_status already use for this same
-- check, re-derived from clinic_memberships itself, never from a
-- client-supplied clinic_id (there isn't one — clinic_id is read off the
-- invitation row, exactly like accept_clinic_invitation resolves it off
-- the token). This is what makes "admin of clinic A regenerates a link
-- belonging to clinic B" structurally impossible: has_clinic_role checks
-- the CALLER's own membership in v_invitation.clinic_id, not clinic B.
--
-- Only ever allowed while status = 'pending' — never accepted (a real
-- membership already exists, regenerating its link is meaningless and
-- must never look like a way to re-invite that member), never
-- revoked/expired (nothing in this task asked for un-revoking/un-expiring
-- via this path; the admin creates a fresh invitation via
-- invite_clinic_member() instead, same as today).
--
-- Concurrency hardening: the initial read locks the row (`for update`),
-- so a concurrent regenerate/accept on the SAME invitation blocks until
-- this transaction commits or rolls back, rather than both racing off the
-- same pre-UPDATE snapshot. The later UPDATE's own `where ... and status =
-- 'pending'` is a second, independent belt-and-suspenders check — even if
-- the row lock strategy ever changed, this makes it structurally
-- impossible to persist a regenerated token onto a row that isn't
-- actually pending anymore. `get diagnostics` after that UPDATE confirms
-- exactly one row was actually written before this function returns
-- anything: a raw_token is only ever handed back for a regeneration that
-- is genuinely persisted, never for one that silently no-opped.
create function public.regenerate_clinic_invitation(p_invitation_id uuid)
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

  -- `for update`: locks this row for the rest of the transaction, closing
  -- the read/validate/UPDATE race a plain select would leave open against
  -- a concurrent regenerate or accept on the same invitation (see this
  -- function's own header comment).
  select * into v_invitation
  from public.clinic_invitations
  where public.clinic_invitations.id = p_invitation_id
  for update;

  if v_invitation.id is null then
    raise exception 'invitation not found';
  end if;

  -- Re-checked against the INVITATION's own clinic_id, never a
  -- client-supplied one — see this migration's own header comment on why
  -- that's what makes cross-clinic regeneration structurally impossible.
  if not public.has_clinic_role(v_invitation.clinic_id, array['clinic_admin']::public.membership_role[]) then
    raise exception 'only an active clinic_admin of this clinic can regenerate this invitation' using errcode = '42501';
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

revoke execute on function public.regenerate_clinic_invitation(uuid) from public;
grant execute on function public.regenerate_clinic_invitation(uuid) to authenticated;
-- Not granted to anon: regenerating always requires an authenticated,
-- already-active clinic_admin session, same as invite_clinic_member.
