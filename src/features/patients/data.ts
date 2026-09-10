import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReferenceValue } from "@/features/rips/catalog-data";

// Real /pacientes data — takes an already-constructed SupabaseClient (same
// convention as src/features/session/resolve-clinic-context.ts and
// src/features/clinic/data.ts) so the exact same query logic runs
// unchanged from the Server Component (src/app/pacientes/page.tsx, the
// server-first initial load) or a Client Component refetch. clinic_id
// always comes from CurrentUserContext (resolveClinicContext) — never
// accepted from a URL/form as its own source of authority.
//
// public.patients is the only real table backing this feature today (see
// the foundation schema migration) — id, clinic_id, first_name, last_name,
// document_id, phone, email, birth_date, active, created_at, updated_at.
// No dentist assignment column (patients belong to the Clinic, not a
// Dentist — see CLAUDE.md Domain Model), no appointment/clinical columns
// at all (appointments/historia clínica/odontograma are explicitly out of
// scope for the foundation schema).

export type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  active: boolean;
  createdAt: string;
  // RIPS #3 — Documento Técnico 1 campos U01-U08/U11 (usuarios[]). Todos
  // nullable: no todo paciente existente los tiene completos todavía, ver
  // src/features/rips/completeness.ts. documentId (arriba) sigue siendo
  // el campo libre histórico que ~15 pantallas de solo lectura ya leen —
  // se mantiene sincronizado como "TIPO NUMERO" al guardar desde el
  // formulario real (ver actions.ts), nunca reescrito aquí.
  documentType: string | null;
  documentNumber: string | null;
  sexCode: string | null;
  userTypeCode: string | null;
  countryOfResidenceCode: string | null;
  municipalityOfResidenceCode: string | null;
  residenceZoneCode: string | null;
  countryOfOriginCode: string | null;
};

type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  document_id: string | null;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  active: boolean;
  created_at: string;
  document_type: string | null;
  document_number: string | null;
  sex_code: string | null;
  user_type_code: string | null;
  country_of_residence_code: string | null;
  municipality_of_residence_code: string | null;
  residence_zone_code: string | null;
  country_of_origin_code: string | null;
};

function mapRow(row: PatientRow): Patient {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    documentId: row.document_id,
    phone: row.phone,
    email: row.email,
    birthDate: row.birth_date,
    active: row.active,
    createdAt: row.created_at,
    documentType: row.document_type,
    documentNumber: row.document_number,
    sexCode: row.sex_code,
    userTypeCode: row.user_type_code,
    countryOfResidenceCode: row.country_of_residence_code,
    municipalityOfResidenceCode: row.municipality_of_residence_code,
    residenceZoneCode: row.residence_zone_code,
    countryOfOriginCode: row.country_of_origin_code,
  };
}

// A single string literal (not built via +) so supabase-js can still
// infer the exact row shape from it — concatenation widens this to
// `string`, which breaks that inference (confirmed by tsc).
const PATIENT_COLUMNS =
  "id, first_name, last_name, document_id, phone, email, birth_date, active, created_at, document_type, document_number, sex_code, user_type_code, country_of_residence_code, municipality_of_residence_code, residence_zone_code, country_of_origin_code";

export async function fetchPatients(supabase: SupabaseClient, clinicId: string): Promise<Patient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_COLUMNS)
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

// clinic_id is redundant with RLS (patients_select_member already scopes
// to the caller's own clinic membership) — kept as an explicit second
// check anyway, so a UUID belonging to another clinic returns null (→ the
// page's notFound()) rather than relying on RLS alone (see CLAUDE.md task
// scope, section 3: RLS is a second layer, not the only one).
// RIPS #3 — the small reference catalogs the patient identity form needs
// (Municipio, at 1,124 rows, is deliberately excluded — see
// ReferenceValueAutocomplete's own server-side search action instead).
// Fetched once, server-side, and threaded down to every screen that can
// open NewPatientModal/PatientRecordModal (/pacientes, /agenda's own "Ver
// paciente" flow) — never re-fetched per modal open.
export type PatientIdentityCatalogs = {
  TipoDocumento: ReferenceValue[];
  SEXOconIndeterminado: ReferenceValue[];
  RIPSTipoUsuarioVersion2: ReferenceValue[];
  Pais: ReferenceValue[];
  ZonaVersion2: ReferenceValue[];
};

// The actual fetch (fetchPatientIdentityCatalogs) lives in its own
// server-only module — identity-catalogs.ts — not here: this file
// (data.ts) is imported by both Server AND Client Components (e.g.
// reports-screen.tsx, for the `Patient` type), and pulling in
// @/features/rips/catalog-data's `getActiveReferenceValues` (which
// transitively imports @/lib/supabase/server → next/headers) here would
// make next/headers reachable from client bundles, breaking the build —
// confirmed by trying it first. EMPTY_PATIENT_IDENTITY_CATALOGS has no
// such dependency (a plain object literal) and stays safe to keep here.
export const EMPTY_PATIENT_IDENTITY_CATALOGS: PatientIdentityCatalogs = {
  TipoDocumento: [],
  SEXOconIndeterminado: [],
  RIPSTipoUsuarioVersion2: [],
  Pais: [],
  ZonaVersion2: [],
};

export async function fetchPatientById(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<Patient | null> {
  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}
