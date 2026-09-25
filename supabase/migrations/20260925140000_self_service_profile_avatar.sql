-- Odentia Core — ONE profile photo per user: profiles.avatar_url (already
-- the single field every surface reads: headers, Equipo, Mi perfil
-- profesional, /portal/clinica). This adds:
--
-- 1. One deterministic Storage object per USER: clinic-media
--    avatars/<profile_id> (overwritten on replace — no accumulation),
--    whoever uploads it (the user herself, or her clinic's admin).
-- 2. set_my_avatar(url) — self-service for ANY authenticated user (Clinic
--    Admin, Dentist, Assistant, Patient). The target is ALWAYS auth.uid();
--    there is no profile-id parameter to spoof.
-- 3. set_clinic_member_avatar(membership_id, url) — the Clinic Admin's
--    existing "manage my team's photos" capability, now writing that same
--    per-user object. The clinic comes from the membership row (never a
--    parameter); caller must be clinic_admin of THAT clinic, or platform
--    Superadmin. Replaces set_professional_photo()/set_clinic_member_photo()
--    as the app's write path (both left in place, no longer called).
--
-- Storage: new policies for the avatars/ folder only, gated by
-- owns_profile_avatar_path(): the user herself, a clinic_admin of any clinic
-- the owner is a member of, or Superadmin for a clinic member — never a
-- patient's photo by another patient or by staff. The existing clinic-media
-- policies are untouched (owns_clinic_logo_path() already returns false for
-- a non-uuid first segment such as 'avatars'). Public read, like the rest of
-- the bucket. Bucket type/size limits (jpeg/png/webp, 5 MB) unchanged.
--
-- Additive: no table, column, RLS or data changes.

create function public.can_manage_profile_avatar(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id = auth.uid()
    or exists (
      select 1
      from public.clinic_memberships m
      where m.profile_id = p_profile_id
        and (
          public.has_clinic_role(m.clinic_id, array['clinic_admin']::public.membership_role[])
          or public.is_platform_superadmin()
        )
    );
$$;

revoke execute on function public.can_manage_profile_avatar(uuid) from public;
grant execute on function public.can_manage_profile_avatar(uuid) to authenticated;

create function public.owns_profile_avatar_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if object_name !~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_manage_profile_avatar(split_part(object_name, '/', 2)::uuid);
end;
$$;

revoke execute on function public.owns_profile_avatar_path(text) from public;
grant execute on function public.owns_profile_avatar_path(text) to authenticated;

create policy clinic_media_avatar_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'clinic-media' and public.owns_profile_avatar_path(name));

create policy clinic_media_avatar_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'clinic-media' and public.owns_profile_avatar_path(name))
  with check (bucket_id = 'clinic-media' and public.owns_profile_avatar_path(name));

create policy clinic_media_avatar_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'clinic-media' and public.owns_profile_avatar_path(name));

-- The only accepted value: that user's own avatars/<profile_id> public URL
-- (+ optional ?v= cache-buster), or null to remove.
create function public.is_profile_avatar_url(p_profile_id uuid, p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url ~ ('^https?://[^/?#]+/storage/v1/object/public/clinic-media/avatars/' || p_profile_id::text || '(\?v=[0-9]+)?$');
$$;

create function public.set_my_avatar(p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
begin
  if v_profile_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_avatar_url is not null and not public.is_profile_avatar_url(v_profile_id, p_avatar_url) then
    raise exception 'photo must be your own avatar' using errcode = '22023';
  end if;

  update public.profiles
  set avatar_url = p_avatar_url
  where id = v_profile_id;
end;
$$;

revoke execute on function public.set_my_avatar(text) from public;
grant execute on function public.set_my_avatar(text) to authenticated;

create function public.set_clinic_member_avatar(p_membership_id uuid, p_avatar_url text)
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

  if p_avatar_url is not null and not public.is_profile_avatar_url(v_profile_id, p_avatar_url) then
    raise exception 'photo must be this member''s own avatar' using errcode = '22023';
  end if;

  update public.profiles
  set avatar_url = p_avatar_url
  where id = v_profile_id;
end;
$$;

revoke execute on function public.set_clinic_member_avatar(uuid, text) from public;
grant execute on function public.set_clinic_member_avatar(uuid, text) to authenticated;
