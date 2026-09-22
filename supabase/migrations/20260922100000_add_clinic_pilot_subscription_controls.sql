-- Odentia Core — pilot subscription/commercial-status controls
--
-- "Subscription/Billing readiness para piloto" checkpoint. No billing
-- engine, no payment provider, no cron: this is the minimal, honest
-- state a Superadmin needs to run a handful of piloto clinics with a
-- manual, controlled trial — see this checkpoint's own report for the
-- full inventory. Deliberately reuses public.clinics.status
-- ('active'/'suspended', foundation schema) as the ONE real entitlement
-- switch rather than inventing a new commercial-status enum: it is
-- already the exact mechanism resolveClinicContext()/
-- resolvePatientContext() (src/features/session/ — untouched by this
-- migration, Auth is out of scope for this checkpoint) and the
-- Marketplace SSO-code RPCs already gate real access on. "trialing" is
-- never a persisted status — it's a derived DISPLAY label (status =
-- 'active' AND trial_ends_at in the future), computed by
-- src/features/subscription/commercial-status.ts, never a third enum
-- value.
--
-- Canonical price/trial values used elsewhere in application code
-- (src/features/subscription/plan.ts) come from this repo's own
-- documented "Current business hypothesis" (README.md): COP 99,900/month,
-- 30-day full-access evaluation — never invented here. Price itself is
-- NOT persisted per-clinic (there is exactly one plan today — see
-- README's "One PRO plan" — a second tier is future scope, not this
-- checkpoint's job).

-- ============================================================
-- 1. clinics.trial_ends_at — additive, nullable
-- ============================================================
-- Null means "no trial tracked for this clinic" (e.g. every clinic that
-- existed before this migration) — never backfilled with an invented
-- date. clinics.created_at (foundation schema, untouched) already answers
-- "cuándo comenzó" for any NEWLY provisioned clinic; this column answers
-- "cuándo termina."
alter table public.clinics
  add column trial_ends_at timestamptz null;

-- ============================================================
-- 2. Lock down public.clinics UPDATE to a real, minimal column set
-- ============================================================
-- Real gap found during this checkpoint's own security review: the
-- existing clinics_update_admin RLS policy (foundation RLS migration)
-- authorizes UPDATE for any active clinic_admin of that clinic, on EVERY
-- column, because the existing GRANT (20260826153000) was table-wide
-- ("grant select, update on public.clinics to authenticated"). RLS alone
-- was never going to stop this: it checks WHO can update a ROW, not WHICH
-- COLUMNS — column-level access in Postgres is a GRANT concern. In
-- practice this meant any clinic_admin could already, today, update her
-- OWN clinic's `status` directly via a raw authenticated client call
-- (bypassing every app-level "clinic-suspended" gate, which only ever ran
-- inside the Next.js app, never at the database) — a real
-- self-(re)activation hole, exactly the kind of thing "clinic no puede
-- autoactivarse" (this checkpoint's own security check) is about. It
-- generalizes to the brand-new trial_ends_at column too (a clinic_admin
-- extending her own trial the same way) if left on the same blanket
-- grant.
--
-- Fix: revoke the blanket grant and re-grant UPDATE only on the columns
-- a clinic_admin's own real, existing editors actually write today —
-- updateClinicInfo() (src/features/clinic/actions.ts: name/phone/email/
-- tax_id) and uploadClinicLogo()/removeClinicLogo()
-- (src/features/clinic/logo.ts: logo_url). `status` and `trial_ends_at`
-- are deliberately excluded — from this point on they are writable ONLY
-- through the SECURITY DEFINER RPCs below (is_platform_superadmin()-gated,
-- same "deny by default, RPC is the only writer" convention already used
-- for clinic_invitations/clinic_specialty_rips_services elsewhere in this
-- schema). `legal_name` has no real editor anywhere in this codebase
-- either (see actions.ts's own comment) and is excluded too — harmless,
-- since nothing currently writes it; add it back explicitly the day a
-- real "Razón social" editor ships. SELECT stays untouched (still needed
-- for the UPDATE ... WHERE id = $1 predicate itself, per the original
-- grant's own comment).
revoke update on public.clinics from authenticated;
grant update (name, phone, email, tax_id, logo_url) on public.clinics to authenticated;

-- ============================================================
-- 3. provision_clinic() — seed the trial on creation, same signature
-- ============================================================
-- CREATE OR REPLACE against the EXACT SAME parameter list as
-- 20260916110000 — that migration's own header comment is explicit about
-- why: appending a parameter here would silently create a second,
-- coexisting overload instead of replacing this one. No new parameter is
-- needed: the trial length is a fixed, documented business fact
-- (README.md), not something either caller (Platform's own "Nueva
-- clínica" form, or convert_commercial_prospect_to_clinic()) should be
-- able to override. Both of those callers converge on this ONE function
-- (see this migration's own header comment and CLAUDE.md's Superadmin
-- section — "Ruta A ... Ruta B ... both converge here") — this is the
-- single place a commercial trial gets initialized, never duplicated
-- into either caller separately.
--
-- Everything else in the body is byte-for-byte identical to
-- 20260916110000 — only the clinics INSERT's column/value list changed.
create or replace function public.provision_clinic(
  clinic_name text,
  clinic_slug text,
  clinic_legal_name text default null,
  clinic_tax_id text default null,
  clinic_email text default null,
  clinic_phone text default null,
  location_name text default null,
  location_address text default null,
  location_city text default null,
  location_state text default null,
  location_country text default null,
  location_phone text default null,
  location_timezone text default null,
  location_latitude double precision default null,
  location_longitude double precision default null
)
returns table (
  clinic_id uuid,
  slug text,
  location_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_clinic_id uuid;
  v_location_id uuid;
begin
  if auth.uid() is null then
    raise exception 'provision_clinic requires an authenticated session';
  end if;

  if not public.is_platform_superadmin() then
    raise exception 'only a platform superadmin can provision a clinic' using errcode = '42501';
  end if;

  if clinic_name is null or btrim(clinic_name) = '' then
    raise exception 'clinic_name must not be empty';
  end if;

  v_slug := lower(btrim(clinic_slug));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    raise exception 'clinic_slug must contain at least one alphanumeric character';
  end if;

  if (location_latitude is null) is distinct from (location_longitude is null) then
    raise exception 'location_latitude and location_longitude must both be provided or both be null';
  end if;
  if location_latitude is not null and (location_latitude < -90 or location_latitude > 90) then
    raise exception 'location_latitude must be between -90 and 90';
  end if;
  if location_longitude is not null and (location_longitude < -180 or location_longitude > 180) then
    raise exception 'location_longitude must be between -180 and 180';
  end if;

  -- trial_ends_at = now() + 30 days: the documented "30-day full-access
  -- evaluation" (README.md's own "Current business hypothesis"), applied
  -- uniformly to every new clinic regardless of which route provisioned
  -- it. status keeps its column default ('active') — a brand-new clinic
  -- is always usable from day one; suspension is always a later, explicit
  -- Superadmin action (set_clinic_commercial_status() below), never
  -- implied by provisioning itself.
  insert into public.clinics (name, slug, legal_name, tax_id, email, phone, trial_ends_at)
  values (btrim(clinic_name), v_slug, clinic_legal_name, clinic_tax_id, clinic_email, clinic_phone, now() + interval '30 days')
  returning id into v_clinic_id;

  insert into public.clinic_locations (
    clinic_id, name, address, city, state, country, phone, timezone, is_primary, active,
    latitude, longitude
  )
  values (
    v_clinic_id,
    coalesce(nullif(btrim(location_name), ''), 'Sede principal'),
    location_address,
    location_city,
    location_state,
    coalesce(nullif(btrim(location_country), ''), 'CO'),
    location_phone,
    coalesce(nullif(btrim(location_timezone), ''), 'America/Bogota'),
    true,
    true,
    location_latitude,
    location_longitude
  )
  returning id into v_location_id;

  insert into public.treatments (clinic_id, name)
  select v_clinic_id, t.name
  from (
    values
      ('Primera consulta'),
      ('Chequeo general'),
      ('Limpieza dental'),
      ('Blanqueamiento dental'),
      ('Extracción dental'),
      ('Tratamiento de conductos'),
      ('Consulta de ortodoncia'),
      ('Control de ortodoncia')
  ) as t (name);

  return query select v_clinic_id, v_slug, v_location_id;
end;
$$;
-- CREATE OR REPLACE against the identical signature preserves the
-- existing EXECUTE grant (20260916110000) — not restated here, matching
-- this repo's own convention.

-- ============================================================
-- 4. set_clinic_commercial_status() — Superadmin-only activate/suspend
-- ============================================================
-- "Activar"/"Suspender"/"Reactivar" are all the same call (the enum only
-- has two values) — never a third state invented for this. clinic_id is
-- an explicit parameter (a Superadmin has no membership of her own to
-- derive it from, same reasoning as every other Platform RPC in this
-- schema). Returns the updated row so the client can update its own UI
-- state without a refetch, same convention as provision_clinic() itself.
create function public.set_clinic_commercial_status(
  p_clinic_id uuid,
  p_status public.clinic_status
)
returns table (
  id uuid,
  status public.clinic_status
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'set_clinic_commercial_status requires an authenticated session';
  end if;

  if not public.is_platform_superadmin() then
    raise exception 'only a platform superadmin can change a clinic''s commercial status' using errcode = '42501';
  end if;

  if not exists (select 1 from public.clinics c where c.id = p_clinic_id) then
    raise exception 'clinic not found';
  end if;

  update public.clinics
  set status = p_status
  where public.clinics.id = p_clinic_id;

  return query select p_clinic_id, p_status;
end;
$$;

revoke execute on function public.set_clinic_commercial_status(uuid, public.clinic_status) from public;
grant execute on function public.set_clinic_commercial_status(uuid, public.clinic_status) to authenticated;
-- Not granted to anon: is_platform_superadmin() is the real boundary,
-- same "grant only lets an authenticated call reach the function body"
-- pattern as every privileged RPC in this schema.

-- ============================================================
-- 5. extend_clinic_trial() — Superadmin-only trial-date control
-- ============================================================
-- A single explicit new value, not a "+N days" delta — the Superadmin
-- picks the resulting date directly (same directness as
-- set_clinic_commercial_status above), so there is never a question of
-- what it was extended FROM. Deliberately does not touch `status`: a
-- Superadmin extending the trial of an already-suspended clinic doesn't
-- also reactivate it — that's a second, separate, explicit action via
-- set_clinic_commercial_status.
create function public.extend_clinic_trial(
  p_clinic_id uuid,
  p_trial_ends_at timestamptz
)
returns table (
  id uuid,
  trial_ends_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'extend_clinic_trial requires an authenticated session';
  end if;

  if not public.is_platform_superadmin() then
    raise exception 'only a platform superadmin can extend a clinic''s trial' using errcode = '42501';
  end if;

  if p_trial_ends_at is null then
    raise exception 'trial_ends_at must not be null';
  end if;

  if not exists (select 1 from public.clinics c where c.id = p_clinic_id) then
    raise exception 'clinic not found';
  end if;

  update public.clinics
  set trial_ends_at = p_trial_ends_at
  where public.clinics.id = p_clinic_id;

  return query select p_clinic_id, p_trial_ends_at;
end;
$$;

revoke execute on function public.extend_clinic_trial(uuid, timestamptz) from public;
grant execute on function public.extend_clinic_trial(uuid, timestamptz) to authenticated;
