-- Odentia Core — initial professional schedule (Lunes–Viernes 08:00–17:00)
-- is always real, persisted, editable rows — never an implicit fallback.
--
-- Confirmed root cause (Pilot E2E, 2026-09-24): a Clinic Admin who created
-- her own professional profile got ZERO professional_availability rows, so
-- Agenda ran on the implicit "zero rows" fallback; adding her first block
-- (Lunes) then silently removed every other day. Why she got zero rows:
-- 20260910110000 dropped create_my_professional_profile's 4-argument
-- signature and replaced it with the 6-argument one (document identity)
-- the app actually calls; 20260914090000 then ran `create or replace`
-- against the OLD 4-argument signature, which re-created a second, dead
-- overload that seeds — while the live 6-argument one never did. Same
-- class of bug 20260921090000 fixed for bootstrap_clinic's 22-arg overload.
--
-- This migration:
--   1. create or replace the LIVE 6-argument overload, byte-for-byte from
--      20260910110000, plus the same one-line
--      seed_default_professional_availability() call every other
--      professional-creation path already has (accept_clinic_invitation,
--      both bootstrap_clinic overloads). Same identity → existing EXECUTE
--      grants (authenticated only) preserved.
--   2. drops the dead 4-argument overload 20260914090000 re-created — no
--      caller exists (professional-profile-actions.ts always passes the six
--      named args), and leaving it would make any 4-named-arg call
--      ambiguous against the 6-arg one's defaults.
--   3. materializes the same default for every EXISTING professional
--      profile that has ZERO availability rows, via the same idempotent
--      helper. A profile with ONE OR MORE rows (active or not — including
--      a "Lunes only" schedule) is never touched: its explicit
--      configuration is never inferred to be a bug. Existing appointments
--      are unaffected: validate_appointment_availability() only re-checks
--      a row when its time/duration/professional changes (status-only
--      updates skip it), and Agenda keeps rendering any occupied slot
--      outside a schedule (mergeOccupiedSlotMinutes).
--
-- seed_default_professional_availability() itself (20260914090000) stays
-- the single SQL source of truth for the default (day_of_week 1..5,
-- 08:00–17:00); src/features/dashboard/schedule-config.ts's
-- INITIAL_PROFESSIONAL_SCHEDULE mirrors it, with a vitest drift check.

create or replace function public.create_my_professional_profile(
  p_primary_specialty_id uuid,
  p_license_number text,
  p_default_appointment_duration_minutes integer,
  p_bio text,
  p_document_type text default null,
  p_document_number text default null
)
returns public.professional_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid;
  v_clinic_id uuid;
  v_document_type text;
  v_document_number text;
  v_result public.professional_profiles;
begin
  if auth.uid() is null then
    raise exception 'create_my_professional_profile requires an authenticated session';
  end if;

  select m.id, m.clinic_id
  into v_membership_id, v_clinic_id
  from public.clinic_memberships m
  where m.profile_id = auth.uid()
    and m.status = 'active'
    and m.role = 'clinic_admin'
  limit 1;

  if v_membership_id is null then
    raise exception 'no active clinic_admin membership found for the authenticated user' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.professional_profiles pp where pp.clinic_membership_id = v_membership_id
  ) then
    raise exception 'a professional profile already exists for this membership' using errcode = '23505';
  end if;

  if p_primary_specialty_id is not null then
    perform 1 from public.specialties s where s.id = p_primary_specialty_id and s.active;
    if not found then
      raise exception 'specialty % does not exist or is not active', p_primary_specialty_id;
    end if;
  end if;

  if p_default_appointment_duration_minutes is not null and p_default_appointment_duration_minutes <= 0 then
    raise exception 'default_appointment_duration_minutes must be a positive number of minutes';
  end if;

  v_document_type := nullif(btrim(coalesce(p_document_type, '')), '');
  v_document_number := nullif(btrim(coalesce(p_document_number, '')), '');

  if (v_document_type is null) is distinct from (v_document_number is null) then
    raise exception 'document_type and document_number must both be provided or both be omitted';
  end if;

  if v_document_type is not null then
    perform 1 from public.rips_reference_values
      where catalog_key = 'TipoDocumento' and code = v_document_type and status = 'active';
    if not found then
      raise exception 'document_type % does not exist in the official TipoDocumento catalog', v_document_type;
    end if;
  end if;

  insert into public.professional_profiles (
    clinic_membership_id, clinic_id, primary_specialty_id, license_number,
    default_appointment_duration_minutes, bio, active, document_type, document_number
  )
  values (
    v_membership_id, v_clinic_id, p_primary_specialty_id, nullif(btrim(coalesce(p_license_number, '')), ''),
    p_default_appointment_duration_minutes, nullif(btrim(coalesce(p_bio, '')), ''), true,
    v_document_type, v_document_number
  )
  returning * into v_result;

  perform public.seed_default_professional_availability(v_result.id, v_clinic_id);

  return v_result;
end;
$$;

drop function if exists public.create_my_professional_profile(uuid, text, integer, text);

do $$
declare
  v_profile record;
  v_seeded integer := 0;
begin
  for v_profile in
    select pp.id, pp.clinic_id
    from public.professional_profiles pp
    where not exists (
      select 1 from public.professional_availability pa
      where pa.professional_profile_id = pp.id
    )
  loop
    perform public.seed_default_professional_availability(v_profile.id, v_profile.clinic_id);
    v_seeded := v_seeded + 1;
  end loop;
  raise notice 'initial schedule materialized for % professional profile(s) with zero availability rows', v_seeded;
end;
$$;
