-- Odentia Core — profile avatar uploads use Storage upsert (one fixed
-- avatars/<profile_id> object, overwritten on replace). Supabase Storage's
-- upsert needs SELECT on the object in addition to INSERT/UPDATE; without
-- it the first real upload was rejected (400). Adds the matching SELECT
-- policy, scoped by the SAME guard as the write policies
-- (owns_profile_avatar_path: the owner herself, an admin of a clinic she
-- belongs to, or Superadmin for a clinic member). Grants nothing new in
-- practice — the bucket is already public-read — and never lets anyone
-- list other folders.
--
-- Additive: one policy, no data changes.

create policy clinic_media_avatar_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'clinic-media' and public.owns_profile_avatar_path(name));
