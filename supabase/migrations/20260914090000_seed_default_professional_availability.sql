-- Odentia Core — seed default L–V 08:00–17:00 availability for a NEW
-- professional_profiles row.
--
-- Product decision (prompt ninja "Default de disponibilidad para
-- profesionales nuevos"): a newly created professional must be immediately
-- bookable with Monday–Friday 08:00–17:00, Saturday/Sunday free, WITHOUT
-- relying on validate_appointment_availability()'s own "zero rows →
-- unrestricted" legacy fallback (20260907150000/20260907160000). That
-- fallback stays exactly as-is for historical profiles with zero rows —
-- this migration only changes what happens going forward, at the moment a
-- professional_profiles row is born, and deliberately does NOT touch any
-- existing row (no backfill).
--
-- day_of_week convention reused as-is from professional_availability's own
-- migration (20260907130000): ISO 8601, 1=Lunes..7=Domingo. Monday–Friday
-- is therefore literally day_of_week 1 through 5 — no day-numbering
-- assumption introduced here.
--
-- seed_default_professional_availability() is a small internal helper, not
-- a public RPC: it is only ever called from inside the three existing
-- SECURITY DEFINER functions that are the sole places a professional_profiles
-- row is actually created (bootstrap_clinic, accept_clinic_invitation,
-- create_my_professional_profile) — never from client code, and never
-- granted to anon/authenticated. Each of those three functions already
-- resolves clinic_id/professional_profile_id entirely server-side from
-- auth.uid()/its own just-inserted row, so this helper never receives a
-- client-supplied id of any kind; it inherits the exact same
-- clinic-membership boundary its caller already enforced.
--
-- Multi-tenant integrity is still enforced structurally INSIDE this
-- helper, not merely assumed from its (currently trusted) callers: before
-- touching professional_availability at all, it requires
-- professional_profiles.id = p_professional_profile_id AND
-- professional_profiles.clinic_id = p_clinic_id to exist. This is the
-- exact same canonical relationship professional_availability's own
-- composite FK already relies on
-- (professional_availability_profile_clinic_fk, in
-- 20260907130000) — never a second, divergent membership-based check via
-- clinic_memberships, which would just be re-deriving what
-- professional_profiles.clinic_id already states directly. A mismatch or
-- a non-existent professional_profile_id both raise the same exception,
-- with no identifying detail (no name/email/clinic name) in the message —
-- this stays a plain integrity guard, not a debugging aid.
--
-- Idempotency: guarded by "does this professional_profile_id already have
-- ANY availability row at all" — the same "any row at all" boundary
-- validate_appointment_availability() already uses to distinguish "never
-- configured" from "configured". No new unique constraint is added: the
-- table intentionally allows more than one block per (professional, day)
-- (e.g. a lunch-split), so a per-day uniqueness constraint would change
-- that existing design, not just add idempotency. A retried caller RPC
-- can't actually reach this helper twice for the same profile anyway —
-- accept_clinic_invitation's invitation-status guard and
-- create_my_professional_profile's own clinic_membership_id uniqueness
-- check both already prevent a second professional_profiles row (and thus
-- a second seed call) for the same person — but the helper's own
-- pre-check makes it safe even if called again directly.
create function public.seed_default_professional_availability(
  p_professional_profile_id uuid,
  p_clinic_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.professional_profiles pp
    where pp.id = p_professional_profile_id
      and pp.clinic_id = p_clinic_id
  ) then
    raise exception 'professional_profile_id does not exist or does not belong to clinic_id' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.professional_availability pa
    where pa.professional_profile_id = p_professional_profile_id
  ) then
    return;
  end if;

  insert into public.professional_availability (
    clinic_id, professional_profile_id, day_of_week, start_time, end_time, active
  )
  select p_clinic_id, p_professional_profile_id, d, time '08:00', time '17:00', true
  from generate_series(1, 5) as d;
end;
$$;

revoke execute on function public.seed_default_professional_availability(uuid, uuid) from public;
-- Deliberately not granted to authenticated either: this is only ever
-- called internally, from within the already-privileged SECURITY DEFINER
-- functions below (which run as the function owner, so no explicit grant
-- is needed for them to call it) — never invoked directly by a client.


-- ============================================================
-- bootstrap_clinic — seed defaults for the founder's own professional
-- profile, when is_dentist is true (create or replace, same signature)
-- ============================================================
create or replace function public.bootstrap_clinic(
  clinic_name text,
  clinic_slug text,
  clinic_legal_name text default null,
  clinic_tax_id text default null,
  clinic_email text default null,
  clinic_phone text default null,
  clinic_logo_url text default null,
  location_name text default null,
  location_address text default null,
  location_city text default null,
  location_state text default null,
  location_country text default null,
  location_phone text default null,
  location_timezone text default null,
  is_dentist boolean default false,
  primary_specialty_id uuid default null,
  license_number text default null,
  agenda_color text default null,
  default_appointment_duration_minutes integer default null,
  bio text default null
)
returns table (
  clinic_id uuid,
  slug text,
  location_id uuid,
  membership_id uuid,
  professional_profile_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_slug text;
  v_clinic_id uuid;
  v_location_id uuid;
  v_membership_id uuid;
  v_professional_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'bootstrap_clinic requires an authenticated session';
  end if;

  select p.id into v_profile_id from public.profiles p where p.id = auth.uid();
  if v_profile_id is null then
    raise exception 'no profiles row found for authenticated user %; cannot bootstrap a clinic', auth.uid();
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

  if primary_specialty_id is not null then
    perform 1 from public.specialties s where s.id = primary_specialty_id and s.active;
    if not found then
      raise exception 'specialty % does not exist or is not active', primary_specialty_id;
    end if;
  end if;

  insert into public.clinics (name, slug, legal_name, tax_id, email, phone, logo_url)
  values (btrim(clinic_name), v_slug, clinic_legal_name, clinic_tax_id, clinic_email, clinic_phone, clinic_logo_url)
  returning id into v_clinic_id;

  insert into public.clinic_locations (
    clinic_id, name, address, city, state, country, phone, timezone, is_primary, active
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
    true
  )
  returning id into v_location_id;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, invited_by, joined_at)
  values (v_clinic_id, v_profile_id, 'clinic_admin', 'active', null, now())
  returning id into v_membership_id;

  if is_dentist then
    insert into public.professional_profiles (
      clinic_membership_id, clinic_id, primary_specialty_id, license_number,
      agenda_color, default_appointment_duration_minutes, bio, active
    )
    values (
      v_membership_id, v_clinic_id, primary_specialty_id, license_number,
      agenda_color, default_appointment_duration_minutes, bio, true
    )
    returning id into v_professional_profile_id;

    perform public.seed_default_professional_availability(v_professional_profile_id, v_clinic_id);
  end if;

  return query select v_clinic_id, v_slug, v_location_id, v_membership_id, v_professional_profile_id;
end;
$$;


-- ============================================================
-- accept_clinic_invitation — seed defaults when the accepted role is
-- dentist (create or replace, same signature)
-- ============================================================
create or replace function public.accept_clinic_invitation(p_token text)
returns table (
  membership_id uuid,
  clinic_id uuid,
  role public.membership_role,
  professional_profile_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_hash text;
  v_invitation public.clinic_invitations;
  v_caller_email text;
  v_membership_id uuid;
  v_professional_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'accept_clinic_invitation requires an authenticated session';
  end if;

  select p.email into v_caller_email from public.profiles p where p.id = auth.uid();
  if v_caller_email is null then
    raise exception 'no profile found for the authenticated user';
  end if;

  v_token_hash := encode(extensions.digest(btrim(p_token), 'sha256'), 'hex');

  select * into v_invitation
  from public.clinic_invitations
  where token_hash = v_token_hash;

  if v_invitation.id is null then
    raise exception 'this invitation link is not valid';
  end if;

  if v_invitation.status = 'accepted' then
    raise exception 'this invitation was already accepted';
  end if;
  if v_invitation.status = 'revoked' then
    raise exception 'this invitation was revoked';
  end if;
  if v_invitation.status = 'expired' or v_invitation.expires_at <= now() then
    if v_invitation.status <> 'expired' then
      update public.clinic_invitations set status = 'expired' where id = v_invitation.id;
    end if;
    raise exception 'this invitation has expired';
  end if;

  if lower(v_caller_email) <> lower(v_invitation.email) then
    raise exception 'this invitation was sent to a different email address' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.clinic_memberships
    where clinic_id = v_invitation.clinic_id and profile_id = auth.uid()
  ) then
    raise exception 'you already have a membership in this clinic';
  end if;

  insert into public.clinic_memberships (clinic_id, profile_id, role, status, invited_by, joined_at)
  values (v_invitation.clinic_id, auth.uid(), v_invitation.role, 'active', v_invitation.invited_by, now())
  returning public.clinic_memberships.id into v_membership_id;

  if v_invitation.role = 'dentist' then
    insert into public.professional_profiles (clinic_membership_id, clinic_id, active)
    values (v_membership_id, v_invitation.clinic_id, true)
    returning public.professional_profiles.id into v_professional_profile_id;

    perform public.seed_default_professional_availability(v_professional_profile_id, v_invitation.clinic_id);
  end if;

  update public.clinic_invitations
  set status = 'accepted', accepted_membership_id = v_membership_id
  where id = v_invitation.id;

  return query select v_membership_id, v_invitation.clinic_id, v_invitation.role, v_professional_profile_id;
end;
$$;


-- ============================================================
-- create_my_professional_profile — seed defaults for a Clinic Admin's own,
-- self-service professional profile (create or replace, same signature)
-- ============================================================
create or replace function public.create_my_professional_profile(
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

  insert into public.professional_profiles (
    clinic_membership_id, clinic_id, primary_specialty_id, license_number,
    default_appointment_duration_minutes, bio, active
  )
  values (
    v_membership_id, v_clinic_id, p_primary_specialty_id, nullif(btrim(coalesce(p_license_number, '')), ''),
    p_default_appointment_duration_minutes, nullif(btrim(coalesce(p_bio, '')), ''), true
  )
  returning * into v_result;

  perform public.seed_default_professional_availability(v_result.id, v_clinic_id);

  return v_result;
end;
$$;
