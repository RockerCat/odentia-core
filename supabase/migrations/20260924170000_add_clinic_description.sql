-- Odentia Core — optional clinic description ("Sobre nosotros" in the
-- Patient Portal's /portal/clinica). Edited from Clínica → Información
-- general through the existing updateClinicInfo() flow.
--
-- Additive: one nullable column plus a length check. No existing data is
-- modified and no RLS policy changes:
-- - WHO may write a clinics row stays clinics_update_admin (clinic_admin
--   of that clinic, or platform Superadmin), untouched.
-- - WHICH columns `authenticated` may update is a column-level GRANT since
--   20260922100000 (name, phone, email, tax_id, logo_url). This adds only
--   `description` to that list — the same explicit "add it the day a real
--   editor ships" convention that migration documents; status/
--   trial_ends_at/legal_name stay excluded.
-- - Reads: SELECT on clinics is table-wide already; a Patient reads it only
--   through resolvePatientContext()'s existing clinic embed (same RLS).

alter table public.clinics
  add column description text,
  add constraint clinics_description_length_check
    check (description is null or char_length(description) <= 500);

grant update (description) on public.clinics to authenticated;
