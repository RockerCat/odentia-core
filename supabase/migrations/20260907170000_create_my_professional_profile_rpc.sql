-- Odentia Core — Clinic Admin → crear su propio perfil profesional (real)
--
-- Completes the "Administrador Odontólogo" flow for a Clinic Admin whose
-- clinic was bootstrapped WITHOUT one (bootstrap_clinic's own is_dentist
-- flag only ever runs once, at clinic creation — see that migration's own
-- comment: "professional_profiles — only when the admin also practices").
-- This is the same insert, offered again later, for the admin who
-- initially said "no" and now wants to start seeing patients — never a
-- second creation path with different rules.
--
-- Mirrors update_my_professional_profile()'s own resolution pattern
-- exactly (auth.uid() -> own active membership, never a client-supplied
-- clinic_id/profile_id/membership_id of any kind) with one addition this
-- one needs and that one doesn't: an explicit role = 'clinic_admin' check.
-- update_my_professional_profile() doesn't need one because
-- is_active_clinical_professional() (which every OTHER clinical write
-- already gates on) only matches dentist/clinic_admin roles that already
-- HAVE a professional_profile — a Dentist always gets hers at invitation
-- time (see invite acceptance), so "create my own" is only ever a gap for
-- clinic_admin. Restricting it to that role here, rather than leaving it
-- open to whichever role happens to have no professional_profile yet, is
-- what keeps this from ever becoming a second, divergent way for a
-- Dentist/Assistant to acquire one.
create function public.create_my_professional_profile(
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
  v_membership_id uuid;
  v_clinic_id uuid;
  v_result public.professional_profiles;
begin
  if auth.uid() is null then
    raise exception 'create_my_professional_profile requires an authenticated session';
  end if;

  -- The caller's own active clinic_admin membership, resolved ENTIRELY
  -- from auth.uid() — no client-supplied id of any kind reaches this
  -- query. A Dentist or Assistant calling this simply finds no matching
  -- row (their own membership's role never equals 'clinic_admin') and
  -- gets the same "no active clinic_admin membership" rejection as
  -- someone with no membership at all — structurally impossible for
  -- either role to create one this way, not just policy-checked.
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

  -- Friendly, explicit rejection on the common (sequential) double-submit
  -- path. professional_profiles_clinic_membership_id_key (the existing
  -- unique constraint on clinic_membership_id — see the foundation schema
  -- migration) is the actual guarantee under concurrency: two
  -- simultaneous calls can both pass this check before either has
  -- inserted, but only one insert below can ever succeed — the loser hits
  -- 23505 from the constraint itself, same "pre-check for UX, DB
  -- constraint for the real guarantee" split as every other racy write in
  -- this schema (e.g. appointments_no_overlap).
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

  -- Same column set/shape as bootstrap_clinic's own conditional
  -- professional_profiles insert (agenda_color always null — no consumer
  -- reads it yet, same as that RPC's own callers) — never a second,
  -- diverging creation shape for the exact same table.
  insert into public.professional_profiles (
    clinic_membership_id, clinic_id, primary_specialty_id, license_number,
    default_appointment_duration_minutes, bio, active
  )
  values (
    v_membership_id, v_clinic_id, p_primary_specialty_id, nullif(btrim(coalesce(p_license_number, '')), ''),
    p_default_appointment_duration_minutes, nullif(btrim(coalesce(p_bio, '')), ''), true
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.create_my_professional_profile(uuid, text, integer, text) from public;
grant execute on function public.create_my_professional_profile(uuid, text, integer, text) to authenticated;
-- Not granted to anon: creating a professional profile always requires an
-- authenticated session with an active clinic_admin membership.
