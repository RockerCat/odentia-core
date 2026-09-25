-- Odentia Core — optional clinic cover photo ("portada" of the Patient
-- Portal's /portal/clinica hero). Distinct from the gallery
-- (clinic_gallery_photos): exactly ONE per clinic, managed from Clínica →
-- "Foto de portada". When null the Portal shows Odentia's own generic
-- dental asset, bundled with the app — that fallback is never written here.
--
-- Additive: one nullable column plus a check. No existing data is modified
-- and no RLS policy changes:
-- - Storage: the existing public `clinic-media` bucket (20260924160000),
--   at the deterministic object <clinic_id>/cover, overwritten on replace
--   (so replacing never accumulates orphans). Writes already go through
--   clinic_media_*_admin → owns_clinic_logo_path() (clinic_admin of THAT
--   clinic, or platform Superadmin) — unchanged.
-- - WHO may write a clinics row stays clinics_update_admin (clinic_admin of
--   that clinic, or platform Superadmin), untouched. This only adds
--   `cover_url` to the column-level UPDATE grant (20260922100000's "add it
--   the day a real editor ships" convention, same as `description`).
-- - The value must be that clinic's OWN clinic-media cover object (same
--   shape as professional photos: public URL + optional ?v= cache-buster),
--   so a row can never point at another clinic's (or an arbitrary) image.
-- - Reads: SELECT on clinics is table-wide already; a Patient reads it only
--   through resolvePatientContext()'s existing clinic embed (same RLS).

alter table public.clinics
  add column cover_url text,
  add constraint clinics_cover_url_own_media_check
    check (
      cover_url is null
      or cover_url ~ ('^https?://[^/?#]+/storage/v1/object/public/clinic-media/' || id::text || '/cover(\?v=[0-9]+)?$')
    );

grant update (cover_url) on public.clinics to authenticated;
