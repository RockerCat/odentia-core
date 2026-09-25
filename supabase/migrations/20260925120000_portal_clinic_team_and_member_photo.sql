-- Odentia Core — Portal "Nuestro equipo" shows the clinic's WHOLE active
-- team (not only clinical professionals), and every member can have a
-- photo.
--
-- Additive: two new functions, no table/RLS/data changes.
--
-- 1. get_my_clinic_team() — patient-scoped read of the active team.
--    get_my_clinic_professionals() stays untouched: it is also the Portal
--    booking picker's source (bookable professionals only). Same narrow
--    SECURITY DEFINER shape as that function: clinic_memberships/profiles/
--    professional_profiles stay staff-only for SELECT, and the clinic is
--    resolved from the CALLER's own patient_user_links, never a parameter.
--    Only active memberships of a real clinic role (clinic_admin/dentist/
--    assistant) — never an inactive/suspended member, never another
--    clinic's, never a platform Superadmin (not a membership) or a patient
--    (not a membership). Professional fields only for an ACTIVE
--    professional profile. Display fields only (no email/phone).
--
-- 2. set_clinic_member_photo() — the photo write path for a member WITHOUT
--    a professional profile (assistant, non-clinical admin). Same field
--    (profiles.avatar_url) and same gate as set_professional_photo()
--    (20260924160000): clinic_admin of the membership's OWN clinic
--    (resolved here) or platform Superadmin; the URL must be that clinic's
--    own clinic-media members/<membership_id> object (clinic-media Storage
--    writes are already gated by owns_clinic_logo_path()).

create function public.get_my_clinic_team()
returns table (
  clinic_id uuid,
  profile_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  role public.membership_role,
  professional_profile_id uuid,
  license_number text,
  specialty_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.clinic_id,
    prof.id,
    prof.first_name,
    prof.last_name,
    prof.avatar_url,
    m.role,
    pp.id,
    pp.license_number,
    s.name
  from public.clinic_memberships m
  join public.profiles prof on prof.id = m.profile_id
  left join public.professional_profiles pp on pp.clinic_membership_id = m.id and pp.active
  left join public.specialties s on s.id = pp.primary_specialty_id
  where m.status = 'active'
    and m.role in ('clinic_admin', 'dentist', 'assistant')
    and exists (
      select 1
      from public.patient_user_links l
      join public.patients pt on pt.id = l.patient_id
      where l.profile_id = auth.uid()
        and pt.clinic_id = m.clinic_id
    )
  order by prof.first_name, prof.last_name;
$$;

revoke execute on function public.get_my_clinic_team() from public;
grant execute on function public.get_my_clinic_team() to authenticated;

create function public.set_clinic_member_photo(p_membership_id uuid, p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_profile_id uuid;
begin
  select m.clinic_id, m.profile_id into v_clinic_id, v_profile_id
  from public.clinic_memberships m
  where m.id = p_membership_id;

  if v_clinic_id is null then
    raise exception 'member not found' using errcode = '42501';
  end if;

  if not (
    public.has_clinic_role(v_clinic_id, array['clinic_admin']::public.membership_role[])
    or public.is_platform_superadmin()
  ) then
    raise exception 'not authorized to manage this member' using errcode = '42501';
  end if;

  if p_avatar_url is not null and p_avatar_url !~ (
    '^https?://[^/?#]+/storage/v1/object/public/clinic-media/' || v_clinic_id::text || '/members/' || p_membership_id::text || '(\?v=[0-9]+)?$'
  ) then
    raise exception 'photo must be this clinic''s own member photo' using errcode = '22023';
  end if;

  update public.profiles
  set avatar_url = p_avatar_url
  where id = v_profile_id;
end;
$$;

revoke execute on function public.set_clinic_member_photo(uuid, text) from public;
grant execute on function public.set_clinic_member_photo(uuid, text) to authenticated;
