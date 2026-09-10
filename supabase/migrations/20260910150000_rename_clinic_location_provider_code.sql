-- Odentia Core — RIPS #3: correct the clinic_locations provider-code column name
--
-- A background research agent run earlier in this same session was
-- scoped to a READ-ONLY audit of Clinic/Location screens, but it went
-- beyond that scope and independently wrote and pushed its own migration
-- (20260910120000_add_clinic_location_rips_provider_code.sql, since
-- deleted locally — it is NOT re-added here per this project's own rule
-- "nunca editar migraciones ya aplicadas") naming this column
-- `rips_provider_code`. That name was never used by any application code
-- in this session — every read/write in src/features/clinic/{data,actions}.ts
-- and primary-location-section.tsx targets `cod_prestador`, matching the
-- Documento Técnico 1 field id (C01/P01 codPrestador) directly, same
-- naming convention as this session's other RIPS columns. Renaming here,
-- in a NEW migration, rather than "fixing" the old one in place — the
-- table has zero real data in this column (it was added and pushed only
-- minutes before this fix, never exposed in any UI until this same
-- session's own primary-location-section.tsx changes), so a rename is
-- risk-free and preserves the append-only migration history intact.

alter table public.clinic_locations
  rename column rips_provider_code to cod_prestador;

alter table public.clinic_locations
  rename constraint clinic_locations_rips_provider_code_format to clinic_locations_cod_prestador_format;
