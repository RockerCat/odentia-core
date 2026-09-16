-- Marketplace SSO — Patient buyer identity (Order Attribution follow-up)
--
-- Extends the existing Marketplace SSO primitives (20260915090000,
-- 20260915100000, 20260915130000) to also cover a real Odentia Patient —
-- someone with a patient_user_links row but NO clinic_memberships row at
-- all — as a second, structurally distinct buyer identity type.
--
-- Product invariant this migration exists to enforce, not just document:
-- a Patient's Marketplace identity NEVER carries a clinic, membership, or
-- role. Buyer identity (who is this Odentia user) and clinic attribution
-- (which clinic, if any, should this purchase count toward) are two
-- separate questions — a Patient answers the first without ever
-- answering the second. `buyer_type` is the explicit discriminator that
-- makes this a structural guarantee at the DB level, not an application
-- convention that could silently drift.
--
-- ============================================================
-- marketplace_sso_codes — clinic_id/membership_id/role become nullable
-- ============================================================
-- A Patient code has none of the three: there is no clinic to
-- denormalize, no membership row to reference, no membership_role to
-- snapshot. The existing composite FK
-- (marketplace_sso_codes_membership_clinic_fk) uses Postgres's default
-- MATCH SIMPLE semantics, which only enforces the pair when BOTH columns
-- are non-null — on its own that would also silently accept a
-- half-populated row (e.g. clinic_id set, membership_id null), so the new
-- buyer_shape check below is what actually closes that gap; the FK still
-- does its original job of rejecting a clinic_id/membership_id pair that
-- doesn't correspond to a real clinic_memberships row whenever both ARE
-- present.
alter table public.marketplace_sso_codes
  alter column clinic_id drop not null,
  alter column membership_id drop not null,
  alter column role drop not null;

-- Backfilled to 'clinic_member' for every row that already exists: this
-- table only ever stored clinic-member codes until now, and rows are
-- short-lived (120s TTL) single-use codes with no lasting historical
-- value beyond that — there is nothing to reclassify.
alter table public.marketplace_sso_codes
  add column buyer_type text not null default 'clinic_member';

alter table public.marketplace_sso_codes
  alter column buyer_type drop default;

alter table public.marketplace_sso_codes
  add constraint marketplace_sso_codes_buyer_type_check
  check (buyer_type in ('clinic_member', 'patient'));

-- The actual structural guarantee: a clinic_member row has all three of
-- clinic_id/membership_id/role; a patient row has none of them. No
-- half-attributed state is representable.
alter table public.marketplace_sso_codes
  add constraint marketplace_sso_codes_buyer_shape_check
  check (
    (buyer_type = 'clinic_member' and clinic_id is not null and membership_id is not null and role is not null)
    or
    (buyer_type = 'patient' and clinic_id is null and membership_id is null and role is null)
  );

-- ============================================================
-- issue_marketplace_sso_code — now resolves EITHER buyer type
-- ============================================================
-- Same external contract (no parameters, returns raw_code + expires_at)
-- as 20260915090000 — CREATE OR REPLACE is safe here because the return
-- shape is unchanged; only the body (and what it persists internally)
-- changes.
--
-- Clinic Member takes priority over Patient when, in theory, both could
-- resolve for the same profile — the exact same priority
-- bridgeAuthenticatedContext() (src/features/session/role-bridge.ts)
-- already establishes for this identical pair ("Clinic wins over Patient
-- when both could resolve"). A profile with an active clinic membership
-- is resolved exactly as before (unchanged clinic-member logic, byte-for-
-- byte the same checks); only a profile with ZERO active memberships now
-- falls through to a Patient check instead of failing immediately.
--
-- The Patient check is deliberately EXISTS-only: unlike the Patient
-- Portal's own resolvePatientContext() (which fails closed on more than
-- one patient_user_links row because IT needs to pick exactly one clinic
-- to display), Marketplace never selects or transports a clinic for a
-- Patient buyer at all — so however many links a profile holds, "at least
-- one" is a complete and sufficient answer. This never touches or
-- weakens resolvePatientContext()'s own invariants; it is a separate,
-- narrower question asked directly here.
create or replace function public.issue_marketplace_sso_code()
returns table (
  raw_code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_clinic_id uuid;
  v_membership_id uuid;
  v_role public.membership_role;
  v_active_membership_count integer;
  v_clinic_status public.clinic_status;
  v_buyer_type text;
  v_has_patient_link boolean;
  v_raw_code text;
  v_code_hash text;
  v_expires_at timestamptz;
begin
  if v_profile_id is null then
    raise exception 'issue_marketplace_sso_code requires an authenticated session';
  end if;

  -- Single statement, single snapshot: total_active reflects however many
  -- active memberships exist at the exact moment the one candidate row is
  -- read, so there is no window between "count" and "fetch" where a
  -- concurrent membership change could invalidate the fail-closed check
  -- below.
  select m.id, m.clinic_id, m.role, count(*) over () as total_active
  into v_membership_id, v_clinic_id, v_role, v_active_membership_count
  from public.clinic_memberships m
  where m.profile_id = v_profile_id
    and m.status = 'active'
  limit 1;

  if v_membership_id is not null then
    -- Fail closed on ambiguity, exactly like resolveClinicContext's own
    -- "multiple-memberships" status: V1 has no clinic selector UI, so
    -- more than one active membership must never result in silently
    -- picking one here either.
    if v_active_membership_count > 1 then
      raise exception 'multiple active clinic memberships are not supported yet' using errcode = '42501';
    end if;

    select c.status into v_clinic_status
    from public.clinics c
    where c.id = v_clinic_id;

    if v_clinic_status is distinct from 'active'::public.clinic_status then
      raise exception 'clinic is not operationally active' using errcode = '42501';
    end if;

    v_buyer_type := 'clinic_member';
  else
    -- No active clinic membership — this profile may still be a valid
    -- Patient buyer. No clinic-status revalidation here on purpose: a
    -- Patient's own linked clinic's operational status is irrelevant to
    -- their Marketplace identity, since it is never transported or
    -- attributed at all.
    select exists (
      select 1 from public.patient_user_links l where l.profile_id = v_profile_id
    ) into v_has_patient_link;

    if not v_has_patient_link then
      raise exception 'no active clinic membership or patient link found for this user' using errcode = '42501';
    end if;

    v_buyer_type := 'patient';
    v_clinic_id := null;
    v_membership_id := null;
    v_role := null;
  end if;

  v_raw_code := encode(extensions.gen_random_bytes(32), 'hex');
  v_code_hash := encode(extensions.digest(v_raw_code, 'sha256'), 'hex');
  v_expires_at := now() + interval '120 seconds';

  insert into public.marketplace_sso_codes (code_hash, profile_id, clinic_id, membership_id, role, buyer_type, status, expires_at)
  values (v_code_hash, v_profile_id, v_clinic_id, v_membership_id, v_role, v_buyer_type, 'pending', v_expires_at);

  return query select v_raw_code, v_expires_at;
end;
$$;
-- Grants unaffected by CREATE OR REPLACE — the existing
-- "revoke ... from public; grant ... to authenticated" from 20260915090000
-- still applies to this function unchanged.

-- ============================================================
-- consume_marketplace_sso_code — dropped and recreated: return shape
-- gains buyer_type, and clinic_id/membership_id/role/clinic_name become
-- meaningfully nullable for a patient row
-- ============================================================
-- Dropped and recreated (not CREATE OR REPLACE) because the RETURNS TABLE
-- shape itself changes — same precedent as 20260915130000's own
-- replacement of this identical function for the same reason. The
-- original 20260915100000/20260915130000 migration files are
-- deliberately left untouched (never edit an applied migration). No other
-- migration/function references consume_marketplace_sso_code, so a plain
-- DROP (no CASCADE) is safe.
--
-- Every existing clinic_member behavior is byte-identical to
-- 20260915130000: the same atomic single-statement UPDATE consumption,
-- the same fresh membership/clinic revalidation in the same transaction,
-- the same identical errcode/message on every "not consumable" path. The
-- new patient branch mirrors that same "revalidate fresh at consume time"
-- discipline: a link could have been removed in the (max 120s) window
-- between issuance and redemption, so this re-checks EXISTS again here,
-- never trusting the snapshot taken at issuance alone.
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
  clinic_name text,
  buyer_type text
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
  v_has_patient_link boolean;
begin
  -- Format mirrors issue_marketplace_sso_code() exactly: 32 bytes of
  -- gen_random_bytes encoded as hex is always 64 lowercase hex chars.
  if p_raw_code is null or p_raw_code !~ '^[0-9a-f]{64}$' then
    raise exception 'authorization code is not consumable' using errcode = '22023';
  end if;

  v_code_hash := encode(extensions.digest(p_raw_code, 'sha256'), 'hex');

  -- THE atomicity guarantee: one conditional UPDATE, not a
  -- SELECT-then-UPDATE — see 20260915100000's own comment for the full
  -- reasoning, unchanged here.
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

  if v_code.buyer_type = 'clinic_member' then
    -- Revalidate identity fresh, in the SAME transaction as the UPDATE
    -- above — same reasoning as 20260915100000: any failure below rolls
    -- back the UPDATE too, so a code that fails revalidation is never
    -- left permanently burned.
    select m.* into v_membership
    from public.clinic_memberships m
    where m.id = v_code.membership_id
      and m.profile_id = v_code.profile_id
      and m.clinic_id = v_code.clinic_id
      and m.status = 'active';

    if not found then
      raise exception 'authorization code is not consumable' using errcode = '22023';
    end if;

    select c.name, c.status into v_clinic_name, v_clinic_status
    from public.clinics c
    where c.id = v_code.clinic_id;

    if v_clinic_status is distinct from 'active'::public.clinic_status then
      raise exception 'authorization code is not consumable' using errcode = '22023';
    end if;

    -- role comes from the freshly-read membership, never the snapshot on
    -- marketplace_sso_codes — a role change between issuance and
    -- redemption (up to 120 seconds) must never hand Marketplace a stale
    -- privilege.
    return query
    select p.id, v_membership.clinic_id, v_membership.id, v_membership.role, p.first_name, p.last_name, p.email,
           v_clinic_name, v_code.buyer_type
    from public.profiles p
    where p.id = v_code.profile_id;

  elsif v_code.buyer_type = 'patient' then
    select exists (
      select 1 from public.patient_user_links l where l.profile_id = v_code.profile_id
    ) into v_has_patient_link;

    if not v_has_patient_link then
      raise exception 'authorization code is not consumable' using errcode = '22023';
    end if;

    -- No clinic/membership/role for a patient — explicit nulls, not
    -- omitted columns, so the shape is always exactly the eight declared
    -- output columns regardless of buyer_type.
    return query
    select p.id, null::uuid, null::uuid, null::public.membership_role, p.first_name, p.last_name, p.email,
           null::text, v_code.buyer_type
    from public.profiles p
    where p.id = v_code.profile_id;

  else
    -- Defensive only: marketplace_sso_codes_buyer_type_check already
    -- makes this unreachable for any row this schema can persist.
    raise exception 'authorization code is not consumable' using errcode = '22023';
  end if;
end;
$$;

-- Not a user-callable RPC: only Core's own server-to-server exchange
-- endpoint (running with the service role key, never exposed to a
-- browser) may invoke this. anon/authenticated get no execute privilege
-- at all.
revoke execute on function public.consume_marketplace_sso_code(text) from public;
grant execute on function public.consume_marketplace_sso_code(text) to service_role;
