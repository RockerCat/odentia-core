-- Odentia Core — Patient Portal: "Mis citas" professional display info
--
-- Mis citas needs to show, for each of the patient's own appointments, the
-- treating professional's name/avatar/specialty/registro — but
-- professional_profiles, clinic_memberships, and profiles are ALL staff-only
-- for SELECT (professional_profiles_select_member_or_superadmin,
-- clinic_memberships_select_member_or_superadmin/_self,
-- profiles_select_self_or_clinicmate — confirmed live: none of them have any
-- patient_user_links branch), so a Patient has zero direct read access to
-- any of the three.
--
-- Rather than open broad patient-readable RLS holes on those staff-sensitive
-- tables (clinic_memberships/profiles back several unrelated authorization
-- checks — is_clinic_member, shares_active_clinic_with — widening their
-- audience is exactly the kind of change CLAUDE.md's Security section says
-- to be careful with), this is one narrow SECURITY DEFINER RPC, same
-- pattern as create_my_professional_profile/accept_patient_access_invitation:
-- it returns a professional's display info ONLY for a professional_profile
-- actually referenced by one of the CALLING patient's own appointments
-- (resolved via patient_user_links -> appointments, never a client-supplied
-- patient/clinic id) — nothing broader is ever exposed.
create or replace function public.get_my_appointment_professionals(p_professional_profile_ids uuid[])
returns table (
  professional_profile_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  license_number text,
  specialty_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pp.id,
    prof.first_name,
    prof.last_name,
    prof.avatar_url,
    pp.license_number,
    s.name
  from public.professional_profiles pp
  join public.clinic_memberships m on m.id = pp.clinic_membership_id
  join public.profiles prof on prof.id = m.profile_id
  left join public.specialties s on s.id = pp.primary_specialty_id
  where pp.id = any(p_professional_profile_ids)
    and exists (
      select 1
      from public.appointments a
      join public.patient_user_links l on l.patient_id = a.patient_id
      where a.professional_profile_id = pp.id
        and l.profile_id = auth.uid()
    );
$$;

grant execute on function public.get_my_appointment_professionals(uuid[]) to authenticated;
