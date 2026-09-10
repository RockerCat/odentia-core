import { createClient } from "@/lib/supabase/client";
import type { Patient } from "./data";

// Real writes on public.patients — under patients_insert_admin_or_assistant
// / patients_update_admin_or_assistant RLS (clinic_admin or assistant of
// that clinic only; dentist is SELECT-only by design, matching the
// existing product rule already encoded in that policy). No DELETE here —
// there's no DELETE policy either (the table's own convention is
// active = false, never a real row delete).
//
// RIPS #3: document_type/document_number are the real, official-catalog-
// backed identity pair — server-side validated by the
// validate_patient_rips_identity trigger (see that migration), since this
// table has no RPC layer to validate in instead. document_id (the legacy
// free-text field ~15 read-only screens already display) is kept
// synchronized here as "TIPO NUMERO" whenever both structured fields are
// present, so none of those screens need to change — see
// deriveDocumentId() below.

function deriveDocumentId(documentType: string | null, documentNumber: string | null): string | null | undefined {
  if (documentType && documentNumber) return `${documentType} ${documentNumber}`;
  // Only one of the two present (or neither changed) — never overwrite an
  // existing free-text document_id with a half-derived guess.
  return undefined;
}

export type CreatePatientInput = {
  clinicId: string;
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
};

export type CreatePatientOutcome = { status: "ok"; patient: Patient } | { status: "error"; message: string };

function mapRow(row: {
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
}): Patient {
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
const PATIENT_SELECT_COLUMNS =
  "id, first_name, last_name, document_id, phone, email, birth_date, active, created_at, document_type, document_number, sex_code, user_type_code, country_of_residence_code, municipality_of_residence_code, residence_zone_code, country_of_origin_code";

// Maps the validate_patient_rips_identity trigger's exception text (see
// that migration) to a friendly message — same "match on error.message
// substring" convention already used for the RPC errors in
// professional-profile-actions.ts.
function mapRipsIdentityError(message: string): string | null {
  if (message.includes("document_type")) return "Selecciona un tipo de documento válido.";
  if (message.includes("sex_code")) return "Selecciona un sexo válido.";
  if (message.includes("user_type_code")) return "Selecciona un tipo de usuario válido.";
  if (message.includes("country_of_residence_code") || message.includes("country_of_origin_code")) {
    return "Selecciona un país válido.";
  }
  if (message.includes("municipality_of_residence_code")) return "Selecciona un municipio válido.";
  if (message.includes("residence_zone_code")) return "Selecciona una zona válida.";
  return null;
}

export async function createPatient(input: CreatePatientInput): Promise<CreatePatientOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: input.clinicId,
      first_name: input.firstName,
      last_name: input.lastName,
      document_type: input.documentType,
      document_number: input.documentNumber,
      document_id: deriveDocumentId(input.documentType, input.documentNumber) ?? null,
      phone: input.phone,
      email: input.email,
      birth_date: input.birthDate,
    })
    .select(PATIENT_SELECT_COLUMNS)
    .single();

  if (error) {
    // patients_clinic_id_document_id_key / patients_clinic_id_document_type_number_key
    // — one document per clinic, not global (see the foundation schema
    // migration and the RIPS #3 migration adding the structured pair).
    if (error.code === "23505") {
      return { status: "error", message: "Ya existe un paciente con este documento en tu clínica." };
    }
    const ripsMessage = mapRipsIdentityError(error.message);
    if (ripsMessage) return { status: "error", message: ripsMessage };
    return { status: "error", message: "No pudimos crear el paciente. Intenta de nuevo." };
  }

  return { status: "ok", patient: mapRow(data) };
}

export type PatientPatch = Partial<{
  firstName: string;
  lastName: string;
  documentType: string | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  sexCode: string | null;
  userTypeCode: string | null;
  countryOfResidenceCode: string | null;
  municipalityOfResidenceCode: string | null;
  residenceZoneCode: string | null;
  countryOfOriginCode: string | null;
}>;

export type ActionOutcome = { status: "ok" } | { status: "error"; message: string };

export async function updatePatient(patientId: string, patch: PatientPatch): Promise<ActionOutcome> {
  const supabase = createClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.firstName !== undefined) dbPatch.first_name = patch.firstName;
  if (patch.lastName !== undefined) dbPatch.last_name = patch.lastName;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone;
  if (patch.email !== undefined) dbPatch.email = patch.email;
  if (patch.birthDate !== undefined) dbPatch.birth_date = patch.birthDate;
  if (patch.sexCode !== undefined) dbPatch.sex_code = patch.sexCode;
  if (patch.userTypeCode !== undefined) dbPatch.user_type_code = patch.userTypeCode;
  if (patch.countryOfResidenceCode !== undefined) dbPatch.country_of_residence_code = patch.countryOfResidenceCode;
  if (patch.municipalityOfResidenceCode !== undefined) {
    dbPatch.municipality_of_residence_code = patch.municipalityOfResidenceCode;
  }
  if (patch.residenceZoneCode !== undefined) dbPatch.residence_zone_code = patch.residenceZoneCode;
  if (patch.countryOfOriginCode !== undefined) dbPatch.country_of_origin_code = patch.countryOfOriginCode;

  if (patch.documentType !== undefined) dbPatch.document_type = patch.documentType;
  if (patch.documentNumber !== undefined) dbPatch.document_number = patch.documentNumber;
  if (patch.documentType !== undefined || patch.documentNumber !== undefined) {
    const derived = deriveDocumentId(patch.documentType ?? null, patch.documentNumber ?? null);
    if (derived !== undefined) dbPatch.document_id = derived;
  }

  const { error } = await supabase.from("patients").update(dbPatch).eq("id", patientId);
  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "Ya existe un paciente con este documento en tu clínica." };
    }
    const ripsMessage = mapRipsIdentityError(error.message);
    if (ripsMessage) return { status: "error", message: ripsMessage };
    return { status: "error", message: "No pudimos guardar el cambio. Intenta de nuevo." };
  }
  return { status: "ok" };
}
