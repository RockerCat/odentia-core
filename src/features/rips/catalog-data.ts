import { createClient } from "@/lib/supabase/server";

// Read-only data access for the RIPS catalog infrastructure
// (cups_catalog / diagnosis_catalog / rips_reference_values /
// rips_catalog_imports — see supabase/migrations/20260910090000_create_rips_catalog_infrastructure.sql
// and docs/rips-catalogs.md).
//
// Server-only (uses @/lib/supabase/server, not the browser client): these
// catalogs are meant to be consumed by Server Components/Server Actions —
// the future RIPS engine and any future catalog picker UI, neither of
// which exists yet (see the RIPS 02 implementation report — this prompt
// deliberately builds no UI). Every query here relies on the
// `*_select_authenticated` RLS policies (any authenticated user can read
// — these are shared reference data, never clinic-scoped, see the
// migration's own comment on why no clinic_id exists on these tables).
//
// Writing to any of these tables is NEVER done through this file or
// through the app at all — only scripts/rips-import-*.mjs, running with
// the service_role key, can write here (see that migration's write-path
// comment).

export type RipsServiceType = "consultation" | "procedure" | "unknown";

export type CupsCode = {
  id: string;
  code: string;
  versionLabel: string;
  description: string;
  chapter: string | null;
  section: string | null;
  category: string | null;
  ripsServiceType: RipsServiceType;
  ripsServiceTypeSource: string | null;
  validFrom: string;
  validTo: string | null;
  status: "active" | "superseded" | "deprecated";
};

export type DiagnosisCode = {
  id: string;
  classificationSystem: string;
  code: string;
  versionLabel: string;
  description: string;
  chapter: string | null;
  category: string | null;
  validFrom: string;
  validTo: string | null;
  status: "active" | "superseded" | "deprecated";
};

export type ReferenceValue = {
  id: string;
  catalogKey: string;
  code: string;
  label: string;
  parentCode: string | null;
  versionLabel: string;
  validFrom: string;
  validTo: string | null;
  status: "active" | "superseded" | "deprecated";
};

export type CatalogImport = {
  id: string;
  catalogKey: string;
  versionLabel: string;
  authority: string;
  sourceResolution: string | null;
  sourceDocument: string | null;
  sourceUrl: string | null;
  validFrom: string;
  validTo: string | null;
  status: "active" | "superseded" | "failed";
  rowCount: number;
};

const CUPS_COLUMNS =
  "id, code, version_label, description, chapter, section, category, rips_service_type, rips_service_type_source, valid_from, valid_to, status";

function mapCupsRow(row: {
  id: string;
  code: string;
  version_label: string;
  description: string;
  chapter: string | null;
  section: string | null;
  category: string | null;
  rips_service_type: RipsServiceType;
  rips_service_type_source: string | null;
  valid_from: string;
  valid_to: string | null;
  status: "active" | "superseded" | "deprecated";
}): CupsCode {
  return {
    id: row.id,
    code: row.code,
    versionLabel: row.version_label,
    description: row.description,
    chapter: row.chapter,
    section: row.section,
    category: row.category,
    ripsServiceType: row.rips_service_type,
    ripsServiceTypeSource: row.rips_service_type_source,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    status: row.status,
  };
}

// Looks up a CUPS code among currently active rows (status = 'active',
// i.e. the current version) unless `onDate` is given, in which case it
// resolves whichever version was in effect on that date — needed so a
// past RIPS record can always be reconstructed against the catalog
// version that was actually vigente when it was generated (see the RIPS
// 01 audit's Section 18 on snapshot/historical integrity).
export async function findCupsByCode(code: string, onDate?: string): Promise<CupsCode | null> {
  const supabase = await createClient();
  let query = supabase.from("cups_catalog").select(CUPS_COLUMNS).eq("code", code);

  query = onDate
    ? query.lte("valid_from", onDate).or(`valid_to.is.null,valid_to.gte.${onDate}`)
    : query.eq("status", "active");

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return mapCupsRow(data);
}

// Server-side substring search over currently active CUPS descriptions —
// deliberately capped (`limit`) so no caller can accidentally pull the
// full ~13,640-row catalog into a single response (see the report's
// Section 14, Performance).
export async function searchCups(query: string, limit = 20): Promise<CupsCode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cups_catalog")
    .select(CUPS_COLUMNS)
    .eq("status", "active")
    .ilike("description", `%${query}%`)
    .order("code")
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapCupsRow);
}

const DIAGNOSIS_COLUMNS =
  "id, classification_system, code, version_label, description, chapter, category, valid_from, valid_to, status";

function mapDiagnosisRow(row: {
  id: string;
  classification_system: string;
  code: string;
  version_label: string;
  description: string;
  chapter: string | null;
  category: string | null;
  valid_from: string;
  valid_to: string | null;
  status: "active" | "superseded" | "deprecated";
}): DiagnosisCode {
  return {
    id: row.id,
    classificationSystem: row.classification_system,
    code: row.code,
    versionLabel: row.version_label,
    description: row.description,
    chapter: row.chapter,
    category: row.category,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    status: row.status,
  };
}

export async function findDiagnosisByCode(
  classificationSystem: string,
  code: string,
  onDate?: string,
): Promise<DiagnosisCode | null> {
  const supabase = await createClient();
  let query = supabase
    .from("diagnosis_catalog")
    .select(DIAGNOSIS_COLUMNS)
    .eq("classification_system", classificationSystem)
    .eq("code", code);

  query = onDate
    ? query.lte("valid_from", onDate).or(`valid_to.is.null,valid_to.gte.${onDate}`)
    : query.eq("status", "active");

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return mapDiagnosisRow(data);
}

export async function searchDiagnoses(classificationSystem: string, query: string, limit = 20): Promise<DiagnosisCode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("diagnosis_catalog")
    .select(DIAGNOSIS_COLUMNS)
    .eq("classification_system", classificationSystem)
    .eq("status", "active")
    .ilike("description", `%${query}%`)
    .order("code")
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapDiagnosisRow);
}

const REFERENCE_VALUE_COLUMNS = "id, catalog_key, code, label, parent_code, version_label, valid_from, valid_to, status";

function mapReferenceValueRow(row: {
  id: string;
  catalog_key: string;
  code: string;
  label: string;
  parent_code: string | null;
  version_label: string;
  valid_from: string;
  valid_to: string | null;
  status: "active" | "superseded" | "deprecated";
}): ReferenceValue {
  return {
    id: row.id,
    catalogKey: row.catalog_key,
    code: row.code,
    label: row.label,
    parentCode: row.parent_code,
    versionLabel: row.version_label,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    status: row.status,
  };
}

// Every currently active value of one small reference catalog (Sexo,
// ZonaVersion2, TipoNota, RIPSTipoUsuarioVersion2, ...) — see
// docs/rips-catalogs.md for the catalog_key values this project expects
// to need. Small by construction (these catalogs top out at a few dozen
// rows, per the Documento Técnico 1), so no pagination/limit here — unlike
// searchCups/searchDiagnoses.
export async function getActiveReferenceValues(catalogKey: string): Promise<ReferenceValue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rips_reference_values")
    .select(REFERENCE_VALUE_COLUMNS)
    .eq("catalog_key", catalogKey)
    .eq("status", "active")
    .order("code");

  if (error || !data) return [];
  return data.map(mapReferenceValueRow);
}

// Resolves a single (catalogKey, code) pair to its label — used to show a
// human name for a code a form already has (e.g. a patient's saved
// municipality) without fetching that catalog's other ~1,100 rows just to
// find the one that matches.
export async function findReferenceValueByCode(catalogKey: string, code: string): Promise<ReferenceValue | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rips_reference_values")
    .select(REFERENCE_VALUE_COLUMNS)
    .eq("catalog_key", catalogKey)
    .eq("code", code)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return mapReferenceValueRow(data);
}

// A code only ever means something WITHIN its own catalog_key — "01" is a
// valid GrupoServicios code and a valid ZonaVersion2 code and means two
// completely different things in each. Every caller (new-patient form,
// professional-profile form, future RIPS validations) must always check
// (catalogKey, code) together, never `code` alone — this is that one
// check, so nobody has to remember to scope it correctly by hand.
export async function isValidReferenceCode(catalogKey: string, code: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rips_reference_values")
    .select("id")
    .eq("catalog_key", catalogKey)
    .eq("code", code)
    .eq("status", "active")
    .maybeSingle();

  return !error && data !== null;
}

// Server-side substring search over one catalog's currently active
// labels — the Municipio picker's own backing query (1,124 rows is too
// many to ship to the client at once, see this task's Performance
// section), same capped-limit shape as searchCups/searchDiagnoses above.
export async function searchReferenceValues(catalogKey: string, query: string, limit = 20): Promise<ReferenceValue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rips_reference_values")
    .select(REFERENCE_VALUE_COLUMNS)
    .eq("catalog_key", catalogKey)
    .eq("status", "active")
    .ilike("label", `%${query}%`)
    .order("label")
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapReferenceValueRow);
}

// Municipio is the one reference catalog with an official parent
// hierarchy (→ Departamento) confirmed so far — see the migration's own
// comment on why parent_code has no formal FK yet. This is a thin,
// self-documenting wrapper over getActiveReferenceValues so a future
// caller never has to know the raw catalog_key string.
export async function resolveMunicipality(code: string): Promise<ReferenceValue | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rips_reference_values")
    .select(REFERENCE_VALUE_COLUMNS)
    .eq("catalog_key", "Municipio")
    .eq("code", code)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return mapReferenceValueRow(data);
}

function mapCatalogImportRow(row: {
  id: string;
  catalog_key: string;
  version_label: string;
  authority: string;
  source_resolution: string | null;
  source_document: string | null;
  source_url: string | null;
  valid_from: string;
  valid_to: string | null;
  status: "active" | "superseded" | "failed";
  row_count: number;
}): CatalogImport {
  return {
    id: row.id,
    catalogKey: row.catalog_key,
    versionLabel: row.version_label,
    authority: row.authority,
    sourceResolution: row.source_resolution,
    sourceDocument: row.source_document,
    sourceUrl: row.source_url,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    status: row.status,
    rowCount: row.row_count,
  };
}

// The currently active import/version for a catalog_key — answers "what
// version of CUPS/CIE10/Municipio/... is Odentia using right now, and
// where did it come from" (see the RIPS 01 audit's Section 5).
export async function getActiveCatalogImport(catalogKey: string): Promise<CatalogImport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rips_catalog_imports")
    .select(
      "id, catalog_key, version_label, authority, source_resolution, source_document, source_url, valid_from, valid_to, status, row_count",
    )
    .eq("catalog_key", catalogKey)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return mapCatalogImportRow(data);
}
