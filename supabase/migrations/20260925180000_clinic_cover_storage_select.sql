-- Odentia Core — fix: Clínica → Portal público → "Foto de portada" upload
-- always failed ("No pudimos guardar la imagen").
--
-- Root cause (confirmed on the linked project): the cover is written with
-- Storage upsert to one fixed object, clinic-media <clinic_id>/cover. That
-- write needs a SELECT policy on the object in addition to INSERT/UPDATE —
-- the exact bug 20260826203000 already fixed for clinic-logos and
-- 20260925150000 for avatars/. clinic-media's clinic-folder policies
-- (20260924160000) only grant INSERT/UPDATE/DELETE, so the upload was
-- rejected before any object existed (no <clinic>/cover object was ever
-- created; gallery uploads, plain inserts without upsert, were fine).
--
-- Adds exactly the missing SELECT, scoped to the cover object only and the
-- SAME ownership predicate as the write policies: owns_clinic_logo_path()
-- (clinic_admin of the folder's clinic, or platform Superadmin). No other
-- clinic's files, no patient, no other folder of the bucket. Reads for
-- everyone else stay the bucket's public URL, as before.
--
-- Additive: one policy, no data changes.

create policy clinic_media_cover_select_admin
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'clinic-media'
    and split_part(name, '/', 2) = 'cover'
    and split_part(name, '/', 3) = ''
    and public.owns_clinic_logo_path(name)
  );
