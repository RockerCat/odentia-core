-- Odentia Core — Clínica → Mi perfil profesional: real, self-service edit
--
-- professional_profiles already exists (foundation schema, 20260824210644)
-- with SELECT-only RLS for `authenticated` — the foundation RLS
-- migration's own comment on why UPDATE was deliberately left unpolicied:
-- "even scoped to clinic_admin or to the profile's own owner, RLS can only
-- filter by row, not by column — nothing here stops a full-row UPDATE from
-- also rewriting clinic_id/clinic_membership_id... Reserved for a future
-- RPC with an explicit column whitelist." This migration is that RPC — no
-- new table, no new RLS policy, no new GRANT beyond EXECUTE on the
-- function itself (SELECT on professional_profiles/specialties was already
-- granted — see 20260827130000/20260828100000).
--
-- Reuses is_active_clinical_professional() (defined by the
-- patient_medical_histories migration, already the shared authorization
-- boundary for every other clinical write — Antecedentes/Odontograma/
-- Notas/Plan de Tratamiento) rather than a new role check: dentist, or
-- clinic_admin WITH her own active professional_profile — never a plain
-- clinic_admin, never assistant (see CLAUDE.md Domain Model).
--
-- Deliberately NOT editable here: `active` (that's Equipo's own
-- Desactivar/Reactivar lifecycle action — an admin-managed capacity
-- toggle, not a self-service profile field) and every identity/membership
-- column (clinic_membership_id, clinic_id) — this RPC accepts no clinic_id
-- or profile id of any kind; the row to update is found ENTIRELY from
-- auth.uid()'s own active membership, which is what makes "move my
-- profile to another clinic" or "edit someone else's profile"
-- structurally impossible, not just policy-checked.

create function public.update_my_professional_profile(
  p_primary_specialty_id uuid,
  p_license_number text,
  p_default_appointment_duration_minutes integer,
  p_bio text
)
returns public.professional_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_professional_profile_id uuid;
  v_result public.professional_profiles;
begin
  if auth.uid() is null then
    raise exception 'update_my_professional_profile requires an authenticated session';
  end if;

  -- The caller's own professional_profile, reached ONLY through their own
  -- active membership — never a client-supplied id of any kind. At most
  -- one row: professional_profiles_clinic_membership_id_key is unique,
  -- and V1 has no multi-clinic membership per person.
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

  update public.professional_profiles
  set
    primary_specialty_id = p_primary_specialty_id,
    license_number = nullif(btrim(coalesce(p_license_number, '')), ''),
    default_appointment_duration_minutes = p_default_appointment_duration_minutes,
    bio = nullif(btrim(coalesce(p_bio, '')), '')
  where id = v_professional_profile_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.update_my_professional_profile(uuid, text, integer, text) from public;
grant execute on function public.update_my_professional_profile(uuid, text, integer, text) to authenticated;
-- Not granted to anon: editing a professional profile always requires an
-- authenticated session with an active clinical membership.
