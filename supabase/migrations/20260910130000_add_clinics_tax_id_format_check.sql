-- Odentia Core — RIPS #3: format guard for clinics.tax_id (NIT)
--
-- Documento Técnico 1 field T01 numDocumentoIdObligado: "Número del NIT
-- con el cual se identifique el facturador electrónico en salud" (char,
-- tamaño 4-12) — see the sibling migration
-- 20260910120000_add_clinic_location_cod_prestador.sql for the full
-- citation and why this stays on `clinics`, not `clinic_locations`.
--
-- Added NOT VALID: this only enforces the format on rows written from now
-- on, and deliberately skips validating the 4 clinic rows already in
-- production today — 3 of them already store a plain-digit tax_id (safe),
-- but NOT VALID means this migration carries zero risk even if that were
-- not true, matching this task's own Section 12 (never let a new
-- constraint retroactively break already-imperfect existing data).
-- src/features/clinic/actions.ts's updateClinicInfo() strips non-digit
-- characters (e.g. a "-DV" check-digit suffix) before ever reaching this
-- constraint, so a legitimate NIT typed with a hyphen still saves
-- correctly.

alter table public.clinics
  add constraint clinics_tax_id_format
    check (tax_id is null or (char_length(tax_id) between 4 and 12 and tax_id ~ '^[0-9]+$'))
    not valid;
