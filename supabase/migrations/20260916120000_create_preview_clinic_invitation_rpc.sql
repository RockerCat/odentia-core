-- Odentia Core — preview_clinic_invitation(): safe, pre-auth invitation preview
--
-- Closes a real, audited UX gap: /invitacion/[token] never validated the
-- token before offering signup, so a user with an invalid/expired/
-- accepted/revoked link discovered that only at the very end, after a
-- full signup + email confirmation round trip. This RPC lets the page
-- fail fast, before ever asking for an account.
--
-- Deliberately the FIRST anon-grantable custom RPC in this schema
-- (confirmed by grepping every `grant execute` in supabase/migrations/ —
-- every other one is `authenticated`-only). This is a narrow, intentional
-- exception, not a new general pattern: the page must be able to validate
-- a token BEFORE any session exists at all, exactly the same trust
-- boundary accept_clinic_invitation() already relies on — knowledge of
-- the real, high-entropy raw token (never guessable, never enumerable,
-- same pgcrypto-generated 32-byte value invite_clinic_member() already
-- produces) is what authorizes seeing this invitation's own minimal
-- context, same as it already authorizes accepting it outright.
--
-- Minimal payload, by design (this checkpoint's own scope — no
-- first_name/last_name/phone/provisioning metadata, reserved for a later
-- checkpoint): status, whether it's actually usable right now, the
-- invited email, the role, and the clinic's name. Never returns
-- token_hash, invited_by, accepted_membership_id, id, or clinic_id — none
-- of those are needed to render "esta invitación es para X en la clínica
-- Y" or a clear invalid/expired/accepted/revoked message, and returning
-- them would be exactly the "revela más PII de la necesaria" this task
-- warns against.
--
-- Never mutates anything: no status transition, no membership, no
-- acceptance side effect of any kind — a plain, read-only lookup.
-- accept_clinic_invitation() remains the only real authority; this
-- improves UX, it does not relax or duplicate that RPC's own
-- authorization/validation.
--
-- No enumeration surface beyond what already exists: lookup is a single
-- equality match on token_hash (same shape as accept_clinic_invitation's
-- own query) — there is no way to search by email, by clinic, or to list
-- invitations through this function.
create function public.preview_clinic_invitation(p_token text)
returns table (
  status public.invitation_status,
  usable boolean,
  email text,
  role public.membership_role,
  clinic_name text
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
begin
  v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

  select * into v_invitation
  from public.clinic_invitations
  where public.clinic_invitations.token_hash = v_token_hash;

  -- Not found: `status` stays null, `usable` false — the page treats this
  -- identically to "invalid token", same generic outcome
  -- accept_clinic_invitation() already gives a raw/garbled/never-issued
  -- token, never a different signal that could help distinguish the two.
  if v_invitation.id is null then
    return query select null::public.invitation_status, false, null::text, null::public.membership_role, null::text;
    return;
  end if;

  -- Same expiry semantics as accept_clinic_invitation() — a `pending` row
  -- past its own expires_at reads as effectively expired here too, purely
  -- for display; this function never writes the status transition itself
  -- (accept_clinic_invitation() already does that, on actual acceptance
  -- attempt — no reason to duplicate that write here for a read-only
  -- preview).
  v_effective_status := v_invitation.status;
  if v_effective_status = 'pending' and v_invitation.expires_at <= now() then
    v_effective_status := 'expired';
  end if;

  select c.name into v_clinic_name from public.clinics c where c.id = v_invitation.clinic_id;

  return query
    select
      v_effective_status,
      v_effective_status = 'pending',
      v_invitation.email,
      v_invitation.role,
      v_clinic_name;
end;
$$;

revoke execute on function public.preview_clinic_invitation(text) from public;
grant execute on function public.preview_clinic_invitation(text) to anon, authenticated;
-- anon: required — see this migration's own header comment on why. No
-- direct table access is granted anywhere here: `clinic_invitations` and
-- `clinics` stay exactly as RLS-closed to anon as before; this SECURITY
-- DEFINER function is the only path, and it returns a fixed, minimal
-- column set regardless of caller.
