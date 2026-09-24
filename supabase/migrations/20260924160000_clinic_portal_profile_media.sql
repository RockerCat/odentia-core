-- Odentia Core — real media for the Patient Portal's clinic profile
-- (/portal/clinica): a small clinic photo gallery (max 5) and admin-managed
-- professional photos. Location reuses clinic_locations.latitude/longitude
-- (already present) and the team reuses get_my_clinic_professionals()
-- (already patient-scoped) — nothing new needed for those.
--
-- Storage: a NEW public bucket `clinic-media` (5 MB, jpeg/png/webp — real
-- photos exceed clinic-logos' 2 MB/svg profile). Same tenant model as
-- clinic-logos: the first path segment is the clinic id, and writes reuse
-- owns_clinic_logo_path() (clinic_admin of THAT clinic, or platform
-- Superadmin). Public read like the logo: informational clinic imagery,
-- unguessable uuid paths, no listing (no SELECT policy on objects).
--
-- No existing data is modified.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-media', 'clinic-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy clinic_media_insert_admin
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'clinic-media' and public.owns_clinic_logo_path(name));

create policy clinic_media_update_admin
  on storage.objects for update
  to authenticated
  using (bucket_id = 'clinic-media' and public.owns_clinic_logo_path(name))
  with check (bucket_id = 'clinic-media' and public.owns_clinic_logo_path(name));

create policy clinic_media_delete_admin
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'clinic-media' and public.owns_clinic_logo_path(name));

-- ============================================================
-- Clinic gallery ("Conoce nuestra clínica") — at most 5 per clinic.
-- Only the storage path is stored (never a client-supplied URL), and it
-- must live inside that clinic's own gallery/ folder.
-- ============================================================
create table public.clinic_gallery_photos (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint clinic_gallery_photos_path_in_clinic_folder
    check (split_part(storage_path, '/', 1) = clinic_id::text and split_part(storage_path, '/', 2) = 'gallery' and split_part(storage_path, '/', 3) <> '')
);

create index clinic_gallery_photos_clinic_id_created_at_idx
  on public.clinic_gallery_photos (clinic_id, created_at);

create function public.enforce_clinic_gallery_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialize concurrent inserts for the same clinic so the count can't race.
  perform pg_advisory_xact_lock(hashtext('clinic_gallery_photos:' || new.clinic_id::text));
  if (select count(*) from public.clinic_gallery_photos g where g.clinic_id = new.clinic_id) >= 5 then
    raise exception 'clinic gallery is full (max 5 photos)' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger enforce_clinic_gallery_limit
  before insert on public.clinic_gallery_photos
  for each row execute function public.enforce_clinic_gallery_limit();

alter table public.clinic_gallery_photos enable row level security;

-- Read: the clinic's own team, platform Superadmin, and a Patient linked to
-- a patient record of THAT clinic — never another clinic's photos.
create policy clinic_gallery_photos_select
  on public.clinic_gallery_photos for select
  to authenticated
  using (
    public.is_clinic_member(clinic_id)
    or public.is_platform_superadmin()
    or exists (
      select 1
      from public.patient_user_links l
      join public.patients p on p.id = l.patient_id
      where l.profile_id = auth.uid()
        and p.clinic_id = clinic_gallery_photos.clinic_id
    )
  );

create policy clinic_gallery_photos_insert_admin
  on public.clinic_gallery_photos for insert
  to authenticated
  with check (
    public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[])
    or public.is_platform_superadmin()
  );

create policy clinic_gallery_photos_delete_admin
  on public.clinic_gallery_photos for delete
  to authenticated
  using (
    public.has_clinic_role(clinic_id, array['clinic_admin']::public.membership_role[])
    or public.is_platform_superadmin()
  );

grant select, insert, delete on public.clinic_gallery_photos to authenticated;

-- ============================================================
-- Professional photo — profiles.avatar_url is what every surface already
-- shows for a professional (Agenda, Equipo, Portal). A Clinic Admin can't
-- update another user's profiles row under RLS, so this is the one narrow
-- write path: the caller must be clinic_admin of the professional's OWN
-- clinic (resolved here, never trusted from the client) or Superadmin,
-- and the URL must be that clinic's clinic-media professionals/<id> object
-- (or null to remove).
-- ============================================================
create function public.set_professional_photo(p_professional_profile_id uuid, p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_profile_id uuid;
begin
  select pp.clinic_id, m.profile_id into v_clinic_id, v_profile_id
  from public.professional_profiles pp
  join public.clinic_memberships m on m.id = pp.clinic_membership_id
  where pp.id = p_professional_profile_id;

  if v_clinic_id is null then
    raise exception 'professional not found' using errcode = '42501';
  end if;

  if not (
    public.has_clinic_role(v_clinic_id, array['clinic_admin']::public.membership_role[])
    or public.is_platform_superadmin()
  ) then
    raise exception 'not authorized to manage this professional' using errcode = '42501';
  end if;

  if p_avatar_url is not null and position(
    '/storage/v1/object/public/clinic-media/' || v_clinic_id::text || '/professionals/' || p_professional_profile_id::text
    in p_avatar_url
  ) = 0 then
    raise exception 'photo must be this clinic''s own professional photo' using errcode = '22023';
  end if;

  update public.profiles
  set avatar_url = p_avatar_url
  where id = v_profile_id;
end;
$$;

revoke execute on function public.set_professional_photo(uuid, text) from public;
grant execute on function public.set_professional_photo(uuid, text) to authenticated;
