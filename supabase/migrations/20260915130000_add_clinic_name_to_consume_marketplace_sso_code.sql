-- Marketplace SSO — Paso B extension: propagate clinic_name through
-- consume_marketplace_sso_code
--
-- Adds `clinic_name` to consume_marketplace_sso_code()'s output so
-- Marketplace's customer session can carry a real clinic display name
-- without a second query, a new endpoint, or Marketplace ever touching
-- Core's DB/service-role directly.
--
-- Dropped and recreated (not CREATE OR REPLACE) because the RETURNS TABLE
-- shape itself changes — Postgres does not allow CREATE OR REPLACE
-- FUNCTION to alter an existing function's return type. Same precedent as
-- 20260911090000's own log_rips_export replacement ("Dropped and
-- recreated (not CREATE OR REPLACE) because the parameter list itself
-- changes; the original migration file is left untouched"). The original
-- 20260915100000_create_consume_marketplace_sso_code_rpc.sql is
-- deliberately left untouched (never edit an applied migration). No other
-- migration/function references consume_marketplace_sso_code, so a plain
-- DROP (no CASCADE) is safe.
--
-- Every other behavior below is byte-identical to 20260915100000: the same
-- single-statement atomic UPDATE consumption, the same fresh membership/
-- clinic revalidation in the same transaction, the same identical
-- errcode/message on every "not consumable" path (never distinguishable
-- from the outside), the same SECURITY DEFINER + search_path='' posture,
-- the same service_role-only grant. The ONLY semantic change: the
-- public.clinics row already being read here for its `status` (to confirm
-- the clinic is still active) is now ALSO read for its `name` in that same
-- SELECT — no second query against public.clinics is introduced.
drop function public.consume_marketplace_sso_code(text);

create function public.consume_marketplace_sso_code(p_raw_code text)
returns table (
  core_user_id uuid,
  clinic_id uuid,
  membership_id uuid,
  role public.membership_role,
  first_name text,
  last_name text,
  email text,
  clinic_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_hash text;
  v_code public.marketplace_sso_codes%rowtype;
  v_membership public.clinic_memberships%rowtype;
  v_clinic_status public.clinic_status;
  v_clinic_name text;
begin
  -- Format mirrors issue_marketplace_sso_code() exactly: 32 bytes of
  -- gen_random_bytes encoded as hex is always 64 lowercase hex chars.
  -- Defense in depth only — the HTTP layer already rejects a malformed
  -- body before ever calling this RPC — so a mismatch here is treated
  -- exactly like "no matching row", never a distinct error shape.
  if p_raw_code is null or p_raw_code !~ '^[0-9a-f]{64}$' then
    raise exception 'authorization code is not consumable' using errcode = '22023';
  end if;

  v_code_hash := encode(extensions.digest(p_raw_code, 'sha256'), 'hex');

  -- THE atomicity guarantee: one conditional UPDATE, not a
  -- SELECT-then-UPDATE. Two concurrent callers racing the same code can
  -- both reach this statement, but only one UPDATE can ever match
  -- status = 'pending' — Postgres's row-level locking during the UPDATE
  -- serializes the pair, and the second evaluates its WHERE clause
  -- against the now-'consumed' row and matches zero rows. No advisory
  -- lock or SELECT ... FOR UPDATE needed on top of this.
  update public.marketplace_sso_codes
  set status = 'consumed', consumed_at = now()
  where code_hash = v_code_hash
    and status = 'pending'
    and expires_at > now()
  returning * into v_code;

  if not found then
    -- Deliberately identical message/errcode whether the code never
    -- existed, already expired, or was already consumed — the HTTP layer
    -- must not be able to distinguish these from the outside.
    raise exception 'authorization code is not consumable' using errcode = '22023';
  end if;

  -- Revalidate identity fresh, in the SAME transaction as the UPDATE
  -- above: if any check below fails, the raised exception aborts this
  -- entire function call, and Postgres rolls back the UPDATE along with
  -- it — a code that fails revalidation is never left permanently burned
  -- by a partial transition.
  select m.* into v_membership
  from public.clinic_memberships m
  where m.id = v_code.membership_id
    and m.profile_id = v_code.profile_id
    and m.clinic_id = v_code.clinic_id
    and m.status = 'active';

  if not found then
    raise exception 'authorization code is not consumable' using errcode = '22023';
  end if;

  -- Same clinics row this RPC already read for its status — now also
  -- selecting name in the same statement, not a second query.
  select c.name, c.status into v_clinic_name, v_clinic_status
  from public.clinics c
  where c.id = v_code.clinic_id;

  if v_clinic_status is distinct from 'active'::public.clinic_status then
    raise exception 'authorization code is not consumable' using errcode = '22023';
  end if;

  -- role comes from the freshly-read membership, never the snapshot on
  -- marketplace_sso_codes — a role change between issuance and redemption
  -- (up to 120 seconds) must never hand Marketplace a stale privilege.
  return query
  select p.id, v_membership.clinic_id, v_membership.id, v_membership.role, p.first_name, p.last_name, p.email, v_clinic_name
  from public.profiles p
  where p.id = v_code.profile_id;
end;
$$;

-- Not a user-callable RPC: only Core's own server-to-server exchange
-- endpoint (running with the service role key, never exposed to a
-- browser) may invoke this. anon/authenticated get no execute privilege
-- at all — unlike issue_marketplace_sso_code(), which requires a real
-- logged-in session, redeeming a code must never be reachable from a
-- Supabase client key of any kind.
revoke execute on function public.consume_marketplace_sso_code(text) from public;
-- EXECUTE explícito a `service_role` — nunca asumido, mismo patrón que
-- import_rips_cups_catalog (20260910090000): `service_role` es miembro
-- implícito de PUBLIC igual que cualquier otro rol, así que el revoke de
-- arriba también le habría quitado el privilegio por defecto.
grant execute on function public.consume_marketplace_sso_code(text) to service_role;
