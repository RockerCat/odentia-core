-- Odentia Core — Prospecto Ganado → Crear clínica (optional operational
-- conversion)
--
-- Third checkpoint of the commercial funnel (see 20260916190000/
-- 20260916200000's own headers). This is deliberately a SEPARATE axis
-- from the commercial status pipeline: `status = 'won'` means "the
-- prospect was won commercially" — it never implies a clinic already
-- exists. `converted_clinic_id` (below) means "the corresponding clinic
-- has actually been provisioned." Marking a prospect `won` (the previous
-- checkpoint's RPC) never creates a clinic; this migration's RPC is the
-- one, separate, explicit Superadmin action that does.
--
-- ============================================================
-- 1. commercial_prospects — additive conversion link, nullable
-- ============================================================
-- Nullable, not NOT NULL: every existing prospect (won or not) stays
-- perfectly valid. A real FK (not just a bare uuid column) so an orphaned
-- reference is structurally impossible; `on delete restrict` (the
-- default) is deliberate — a clinic that already has a prospecto behind
-- it is never silently unlinked by a future clinic deletion feature (none
-- exists today, but the FK should never encourage one to quietly corrupt
-- this history). `converted_at` is set together with `converted_clinic_id`
-- (never independently — see the CHECK constraint) so "when" is always
-- available without a second nullable-pair bug class to worry about.
alter table public.commercial_prospects
  add column converted_clinic_id uuid null references public.clinics (id),
  add column converted_at timestamptz null,
  add constraint commercial_prospects_converted_pair
    check ((converted_clinic_id is null) = (converted_at is null));

-- No RLS/grant change needed: commercial_prospects_select_superadmin
-- (20260916190000) already scopes the ENTIRE row set (every column,
-- present or future) to is_platform_superadmin() — an anon/clinic-member
-- caller still gets zero rows, this or any other column included.

-- ============================================================
-- convert_commercial_prospect_to_clinic() — Superadmin-only, idempotent
-- ============================================================
-- Reuses provision_clinic() (20260916110000) UNCHANGED — that migration's
-- own comment already anticipated exactly this: "Designed to be the SAME
-- function a future 'Prospecto → Convertir' flow calls... Ruta A (from a
-- prospecto) and Ruta B (direct) both converge here." This function is
-- pure orchestration: it never duplicates provision_clinic()'s own
-- clinics/clinic_locations/treatments insert logic, it calls that
-- function directly (a normal SQL call from one SECURITY DEFINER
-- function to another — auth.uid() is read from the session's own JWT
-- claim, unaffected by which function currently owns execution, so
-- provision_clinic()'s own is_platform_superadmin() check re-validates
-- correctly and harmlessly).
--
-- Idempotency/double-click/concurrent-request guarantee: `select ... for
-- update` locks the prospect row for the duration of this transaction. A
-- second concurrent call for the SAME prospect blocks on that lock until
-- the first commits, then sees `converted_clinic_id` already set and
-- fails closed with a clear exception — never a second clinic. This is
-- the minimal DB-level guarantee the task calls for, without touching
-- provision_clinic() itself or duplicating its logic.
--
-- Authorization/eligibility, checked in order, before any write: caller
-- authenticated → is_platform_superadmin() → prospect exists → status =
-- 'won' (never new/contacted/demo_scheduled/demo_completed/lost) →
-- converted_clinic_id is still null (never a second conversion). None of
-- this trusts a client-supplied status/converted flag — both are read
-- fresh from the locked row.
create function public.convert_commercial_prospect_to_clinic(
  p_prospect_id uuid,
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
  v_status public.commercial_prospect_status;
  v_converted_clinic_id uuid;
  v_result record;
begin
  if auth.uid() is null then
    raise exception 'convert_commercial_prospect_to_clinic requires an authenticated session';
  end if;

  if not public.is_platform_superadmin() then
    raise exception 'only a platform superadmin can convert a commercial prospect' using errcode = '42501';
  end if;

  select status, converted_clinic_id
  into v_status, v_converted_clinic_id
  from public.commercial_prospects
  where id = p_prospect_id
  for update;

  if v_status is null then
    raise exception 'prospect not found';
  end if;

  if v_status is distinct from 'won' then
    raise exception 'prospect must be won before it can be converted to a clinic';
  end if;

  if v_converted_clinic_id is not null then
    raise exception 'prospect has already been converted to a clinic';
  end if;

  select * into v_result
  from public.provision_clinic(
    clinic_name,
    clinic_slug,
    clinic_legal_name,
    clinic_tax_id,
    clinic_email,
    clinic_phone,
    location_name,
    location_address,
    location_city,
    location_state,
    location_country,
    location_phone,
    location_timezone,
    location_latitude,
    location_longitude
  );

  update public.commercial_prospects
  set converted_clinic_id = v_result.clinic_id, converted_at = now()
  where id = p_prospect_id
    and converted_clinic_id is null;

  return query select v_result.clinic_id, v_result.slug, v_result.location_id;
end;
$$;

revoke execute on function public.convert_commercial_prospect_to_clinic(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision
) from public;

grant execute on function public.convert_commercial_prospect_to_clinic(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, double precision, double precision
) to authenticated;
-- Not granted to anon: only an authenticated, real platform Superadmin
-- may ever reach this — is_platform_superadmin() is the actual
-- authorization boundary (checked here AND, redundantly but harmlessly,
-- again inside provision_clinic() itself); this grant only lets an
-- authenticated call reach the function body at all, same pattern as
-- every other privileged RPC in this schema.
