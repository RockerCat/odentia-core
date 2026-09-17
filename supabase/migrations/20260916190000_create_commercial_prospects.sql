-- Odentia Core — commercial_prospects: public commercial funnel capture
--
-- First real piece of the public funnel documented in CLAUDE.md:
-- Landing → "Quiero Odentia para mi clínica" → /demo → Prospecto →
-- seguimiento comercial (Platform, not built yet) → conversión →
-- provision_clinic(). This migration only adds the Prospecto entity and
-- its one public write path — nothing about Platform follow-up or
-- conversion.
--
-- A commercial_prospects row is deliberately NOT any Odentia identity
-- entity: never auth.users, never profiles, never clinics, never
-- clinic_memberships, never clinic_invitations. Submitting /demo's form
-- must never create an Auth user, never ask for a password, never sign
-- anyone in, and never call bootstrap_clinic()/provision_clinic()/any
-- membership or invitation RPC. A future conversion to a real clinic is a
-- separate, explicit Superadmin action reusing provision_clinic() — out
-- of scope here. For that reason this table has no FK toward any of those
-- identity tables (not even a nullable one) — a Prospecto must be able to
-- exist with zero Odentia identity behind it, by design.
--
-- No dedup rules yet, by explicit product decision for this checkpoint:
-- no UNIQUE(email)/UNIQUE(phone), no rejection of a repeat submission, no
-- silent update of a prior row. The same person may legitimately submit
-- again (a second clinic, a retry, a correction) — every submission is
-- its own row.
create type public.commercial_prospect_status as enum (
  'new',
  'contacted',
  'demo_scheduled',
  'demo_completed',
  'won',
  'lost'
);

create table public.commercial_prospects (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  clinic_name text not null,
  email text not null,
  phone text not null,
  city text not null,
  -- Always 'new' at creation — enforced by submit_commercial_prospect()
  -- below, never a value the public caller can choose. Later
  -- contacted/demo_scheduled/demo_completed/won/lost transitions belong
  -- to a future Platform → Prospectos checkpoint, not this one.
  status public.commercial_prospect_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_prospects_first_name_length check (char_length(first_name) between 1 and 100),
  constraint commercial_prospects_last_name_length check (char_length(last_name) between 1 and 100),
  constraint commercial_prospects_clinic_name_length check (char_length(clinic_name) between 1 and 200),
  constraint commercial_prospects_email_format
    check (char_length(email) between 5 and 255 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint commercial_prospects_phone_length check (char_length(phone) between 1 and 30),
  constraint commercial_prospects_city_length check (char_length(city) between 1 and 100)
);

create trigger set_updated_at
  before update on public.commercial_prospects
  for each row execute function public.set_updated_at();

-- RLS enabled with no anon/authenticated write policy at all, same
-- pattern as marketplace_sso_codes (20260915090000): only postgres/
-- service_role (bypass RLS) and this migration's own SECURITY DEFINER
-- function (executes as the table owner) can write. The only read policy
-- is scoped to a future platform Superadmin — see below — never a clinic
-- member, never anon.
alter table public.commercial_prospects enable row level security;

-- Superadmin read, prepared now so a future Platform → Prospectos screen
-- doesn't need its own RLS migration — same is_platform_superadmin()
-- widening pattern as clinics_select_member_or_superadmin/
-- clinic_invitations_select_admin (20260916170000). This does NOT build
-- that screen; it only makes the read path legal ahead of time. No clinic
-- role ever gets SELECT here.
grant select on public.commercial_prospects to authenticated;

create policy commercial_prospects_select_superadmin
  on public.commercial_prospects
  for select
  to authenticated
  using (public.is_platform_superadmin());

-- ============================================================
-- submit_commercial_prospect() — the one public write path
-- ============================================================
-- Anon-callable by design (the visitor filling /demo's form has no
-- session at all) — the second anon-grantable RPC in this schema after
-- preview_clinic_invitation() (20260916120000), same reasoning: the
-- caller has no other way to reach this table, RLS keeps every other
-- command closed, and this function does exactly one thing — insert one
-- row with a server-forced status, nothing else. No auth.uid() check
-- (deliberately — this must work with zero session), no read of any
-- other table, no side effect beyond this single INSERT.
--
-- Every value is trimmed and re-validated here independently of
-- whatever /demo's own client-side validation already did — the client
-- is never trusted. Length bounds mirror the table's own CHECK
-- constraints exactly (kept in sync manually, same as
-- provision_first_clinic_admin_invitation()'s own required-field
-- checks): a caller gets a clear exception here rather than a raw
-- constraint-violation error code.
create function public.submit_commercial_prospect(
  p_first_name text,
  p_last_name text,
  p_clinic_name text,
  p_email text,
  p_phone text,
  p_city text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text;
  v_last_name text;
  v_clinic_name text;
  v_email text;
  v_phone text;
  v_city text;
  v_id uuid;
begin
  v_first_name := nullif(btrim(p_first_name), '');
  v_last_name := nullif(btrim(p_last_name), '');
  v_clinic_name := nullif(btrim(p_clinic_name), '');
  v_phone := nullif(btrim(p_phone), '');
  v_city := nullif(btrim(p_city), '');
  v_email := lower(nullif(btrim(p_email), ''));

  if v_first_name is null or char_length(v_first_name) > 100 then
    raise exception 'first_name is required';
  end if;
  if v_last_name is null or char_length(v_last_name) > 100 then
    raise exception 'last_name is required';
  end if;
  if v_clinic_name is null or char_length(v_clinic_name) > 200 then
    raise exception 'clinic_name is required';
  end if;
  if v_email is null or char_length(v_email) > 255 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;
  if v_phone is null or char_length(v_phone) > 30 then
    raise exception 'phone is required';
  end if;
  if v_city is null or char_length(v_city) > 100 then
    raise exception 'city is required';
  end if;

  insert into public.commercial_prospects (first_name, last_name, clinic_name, email, phone, city, status)
  values (v_first_name, v_last_name, v_clinic_name, v_email, v_phone, v_city, 'new')
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_commercial_prospect(text, text, text, text, text, text) from public;
grant execute on function public.submit_commercial_prospect(text, text, text, text, text, text) to anon, authenticated;
-- anon: required — see this function's own header comment on why. No
-- direct table grant is given anywhere in this migration beyond the
-- Superadmin-scoped SELECT above: insert/update/delete on
-- commercial_prospects stay exactly as RLS-closed to anon and
-- authenticated as every other write on this table; this SECURITY
-- DEFINER function is the only INSERT path.
