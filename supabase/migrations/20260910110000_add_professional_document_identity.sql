-- Odentia Core — RIPS #3: identidad documental estructurada del profesional
--
-- The RIPS 01 audit flagged that professional_profiles had no structured
-- document identity at all — just license_number (a professional
-- registration number, not a national ID). This adds document_type +
-- document_number as a genuine pair (never a single "CC 123456" string),
-- reusing the SAME official catalog already imported for patient identity
-- (rips_reference_values, catalog_key = 'TipoDocumento' — see RIPS 02E:
-- 13 official SISPRO document types, CC/CE/TI/PA/RC/etc.). A national ID
-- type is a property of the PERSON, not of the RIPS usuario role — no
-- reason to duplicate the catalog or invent a professional-specific one.
--
-- Nullable, backward-compatible: both existing professional_profiles rows
-- in production today have neither field, and nothing here requires them
-- retroactively (see CLAUDE.md's "Functional Freeze" + this task's own
-- Section 12 — nullable now, completeness surfaced later via
-- getProfessionalRipsIdentityCompleteness(), never a blocking NOT NULL).
--
-- Deliberately NOT a physical foreign key to rips_reference_values: that
-- table's only unique constraint is (catalog_key, code, version_label) —
-- see 20260910090000's own table definition — so a real FK would either
-- pin every professional permanently to one catalog version_label
-- (breaking the moment TipoDocumento is reimported under a new version)
-- or be impossible to declare at all. Validation instead happens inside
-- the two RPCs that are the ONLY write path to this table (no direct
-- INSERT/UPDATE RLS policy exists on professional_profiles — see the
-- foundation RLS migration's own comment on why), matching the existing
-- primary_specialty_id validation style in both RPCs already.

alter table public.professional_profiles
  add column document_type text,
  add column document_number text;

alter table public.professional_profiles
  add constraint professional_profiles_document_type_length
    check (document_type is null or char_length(document_type) = 2);

alter table public.professional_profiles
  add constraint professional_profiles_document_both_or_neither
    check ((document_type is null) = (document_number is null));

alter table public.professional_profiles
  add constraint professional_profiles_document_number_not_blank
    check (document_number is null or btrim(document_number) <> '');


-- ============================================================
-- create_my_professional_profile — add p_document_type/p_document_number
-- ============================================================
-- create or replace changes this function's argument list, which changes
-- its identifying signature — the old 4-arg overload below is explicitly
-- dropped first so authenticated is never left holding EXECUTE on a
-- stale, superseded signature nobody calls anymore.

drop function if exists public.create_my_professional_profile(uuid, text, integer, text);

create function public.create_my_professional_profile(
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

  return v_result;
end;
$$;

revoke execute on function public.create_my_professional_profile(uuid, text, integer, text, text, text) from public;
grant execute on function public.create_my_professional_profile(uuid, text, integer, text, text, text) to authenticated;


-- ============================================================
-- update_my_professional_profile — add p_document_type/p_document_number
-- ============================================================

drop function if exists public.update_my_professional_profile(uuid, text, integer, text);

create function public.update_my_professional_profile(
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
  v_clinic_id uuid;
  v_professional_profile_id uuid;
  v_document_type text;
  v_document_number text;
  v_result public.professional_profiles;
begin
  if auth.uid() is null then
    raise exception 'update_my_professional_profile requires an authenticated session';
  end if;

  select m.clinic_id, pp.id
  into v_clinic_id, v_professional_profile_id
  from public.clinic_memberships m
  join public.professional_profiles pp on pp.clinic_membership_id = m.id
  where m.profile_id = auth.uid()
    and m.status = 'active'
  limit 1;

  if v_professional_profile_id is null then
    raise exception 'no professional profile found for the authenticated user';
  end if;

  if not public.is_active_clinical_professional(v_clinic_id) then
    raise exception 'not authorized to edit this professional profile' using errcode = '42501';
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

  update public.professional_profiles
  set
    primary_specialty_id = p_primary_specialty_id,
    license_number = nullif(btrim(coalesce(p_license_number, '')), ''),
    default_appointment_duration_minutes = p_default_appointment_duration_minutes,
    bio = nullif(btrim(coalesce(p_bio, '')), ''),
    document_type = v_document_type,
    document_number = v_document_number
  where id = v_professional_profile_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.update_my_professional_profile(uuid, text, integer, text, text, text) from public;
grant execute on function public.update_my_professional_profile(uuid, text, integer, text, text, text) to authenticated;
