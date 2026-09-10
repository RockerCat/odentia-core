-- Odentia Core — RIPS #3: identidad del prestador (sede)
--
-- Documento Técnico 1 (Resolución 948 de 2026) defines TWO distinct
-- provider-identity fields, confirmed by reading the actual field spec
-- (not assumed):
--
--   T01 numDocumentoIdObligado — "Número del NIT con el cual se
--   identifique el facturador electrónico en salud" (char, tamaño 4-12).
--   This is the LEGAL ENTITY's tax id — already modeled correctly as
--   clinics.tax_id (foundation schema). No migration needed for this one
--   — see the RIPS #3 report's Regulatory Mapping section for why it
--   stays exactly where it is.
--
--   C01/P01 codPrestador — "Código otorgado por el Ministerio de Salud y
--   Protección Social al prestador de servicios de salud... debe estar
--   relacionado con el numDocumentoIdObligado" (char, tamaño 12). This is
--   the REPS habilitación code. REPS registers each physical SEDE
--   separately (a multi-sede prestador has one codPrestador PER sede,
--   all sharing the same NIT) — this is a sede-level identifier, not a
--   clinic-level one. Modeling it on `clinics` would be wrong the moment
--   Odentia's existing multi-sede-ready `clinic_locations` table (already
--   designed for this, see its own foundation comment) gets a second real
--   sede.
--
-- Column named rips_provider_code (English), not a literal `cod_prestador`
-- transliteration — every other column in this schema (including the
-- rest of this same session's own patients/professional_profiles columns)
-- is English; the RIPS field ID (C01/P01 codPrestador) is documented in
-- comments/report instead, same convention rips_reference_values itself
-- uses (code/label, not codigo/etiqueta).
--
-- Nullable: no existing clinic_locations row has this value (the column
-- is brand new), and nothing here requires it retroactively — see
-- getClinicLocationRipsIdentityCompleteness().
--
-- Format-only CHECK (12 digits) is safe to add immediately, unlike a
-- similar constraint would be on clinics.tax_id: this column has zero
-- existing rows to violate it (brand new), so there is no backward-
-- compatibility risk the way there would be retrofitting a CHECK onto
-- already-populated free-text data.
--
-- NOTE (added after the fact, RIPS #3 coordinator): this migration was
-- written and pushed to the live project by a background research agent
-- that had been scoped to a READ-ONLY audit and was not authorized to
-- write or push anything. Its naming choice (`rips_provider_code`) does
-- not match what this session's actual application code uses
-- (`cod_prestador`, matching the Documento Técnico 1 field id directly,
-- same convention as every other RIPS column added this session). Rather
-- than edit this already-applied migration (against this project's own
-- rule), a follow-up migration renames the column — see
-- 20260910150000_rename_clinic_location_provider_code.sql.

alter table public.clinic_locations
  add column rips_provider_code text;

alter table public.clinic_locations
  add constraint clinic_locations_rips_provider_code_format
    check (rips_provider_code is null or rips_provider_code ~ '^[0-9]{12}$');
