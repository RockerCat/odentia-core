-- Marketplace SSO — Paso A: persistencia + emisión del authorization code
--
-- Core is the identity authority for Odentia Marketplace's future customer
-- session. This migration adds ONLY the opaque, single-use authorization
-- code primitive (table + issuing RPC) that a real Core session exchanges
-- for a short-lived code, later redeemed server-to-server by Marketplace
-- (Paso B, not part of this migration — no consume/exchange logic here).
--
-- Token handling mirrors clinic_invitations' own precedent exactly (see
-- 20260907090000_create_team_invitation_rpcs.sql): pgcrypto's
-- gen_random_bytes/digest for a real cryptographic token, returned ONCE to
-- the caller, NEVER stored in plain form — only its SHA-256 hash
-- (code_hash) is persisted.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- marketplace_sso_codes — one-time authorization codes for Marketplace SSO
-- ============================================================
-- profile_id/clinic_id/role are a snapshot taken at issuance time, from
-- server-side-verified data only (see issue_marketplace_sso_code below) —
-- never from caller-supplied input. clinic_id is denormalized from
-- clinic_memberships purely so a future consumer never has to join back to
-- clinic_memberships to learn which clinic a code was issued for; the
-- composite FK below makes an inconsistent (membership_id, clinic_id) pair
-- structurally impossible to insert, same technique as
-- professional_profiles_membership_clinic_fk.
create table public.marketplace_sso_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  membership_id uuid not null,
  role public.membership_role not null,
  -- Minimal status domain for this entity only — deliberately a plain
  -- text + check, not a new enum type, since this table alone ever uses
  -- it and it has no `revoked` state, unlike invitation_status.
  status text not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint marketplace_sso_codes_code_hash_key unique (code_hash),
  constraint marketplace_sso_codes_status_check check (status in ('pending', 'consumed', 'expired')),
  constraint marketplace_sso_codes_membership_clinic_fk
    foreign key (membership_id, clinic_id)
    references public.clinic_memberships (id, clinic_id)
    on delete cascade
);

-- RLS enabled with ZERO policies, same pattern the foundation schema uses
-- for every private table before its own policies migration lands (see
-- 20260824210644_create_foundation_schema.sql's own comment on this) —
-- anon/authenticated get no direct access at all. Only postgres/
-- service_role (which bypass RLS) and this migration's own
-- SECURITY DEFINER function (which executes as the table owner) can read
-- or write this table. No policies are added here on purpose: emission
-- goes exclusively through issue_marketplace_sso_code below, and
-- consumption (Paso B) will be its own SECURITY DEFINER RPC, never a
-- direct client read/write.
alter table public.marketplace_sso_codes enable row level security;

-- ============================================================
-- issue_marketplace_sso_code — mint a one-time SSO code for the caller's
-- own real Supabase session
-- ============================================================
-- No parameters: profile_id/clinic_id/membership_id/role are ALWAYS
-- resolved server-side from auth.uid() and clinic_memberships, exactly
-- like invite_clinic_member resolves clinic_id from the caller's own
-- membership rather than accepting it as an argument — this is what makes
-- "mint a code for someone else's clinic" structurally impossible, not
-- just policy-checked.
create function public.issue_marketplace_sso_code()
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

  if v_membership_id is null then
    raise exception 'no active clinic membership found for this user' using errcode = '42501';
  end if;

  -- Fail closed on ambiguity, exactly like resolveClinicContext's own
  -- "multiple-memberships" status (src/features/session/resolve-clinic-
  -- context.ts): V1 has no clinic selector UI, so more than one active
  -- membership must never result in silently picking one here either.
  if v_active_membership_count > 1 then
    raise exception 'multiple active clinic memberships are not supported yet' using errcode = '42501';
  end if;

  select c.status into v_clinic_status
  from public.clinics c
  where c.id = v_clinic_id;

  if v_clinic_status is distinct from 'active'::public.clinic_status then
    raise exception 'clinic is not operationally active' using errcode = '42501';
  end if;

  v_raw_code := encode(extensions.gen_random_bytes(32), 'hex');
  v_code_hash := encode(extensions.digest(v_raw_code, 'sha256'), 'hex');
  v_expires_at := now() + interval '120 seconds';

  insert into public.marketplace_sso_codes (code_hash, profile_id, clinic_id, membership_id, role, status, expires_at)
  values (v_code_hash, v_profile_id, v_clinic_id, v_membership_id, v_role, 'pending', v_expires_at);

  return query select v_raw_code, v_expires_at;
end;
$$;

revoke execute on function public.issue_marketplace_sso_code() from public;
grant execute on function public.issue_marketplace_sso_code() to authenticated;
-- Not granted to anon: minting a code always requires an already-
-- authenticated real Core session.
