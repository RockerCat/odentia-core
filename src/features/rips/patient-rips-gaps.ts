// RIPS — "Corregir" for a patient-scope readiness gap without leaving
// /rips. Pure — no Supabase import, same "testable without the screen"
// convention as export-readiness.ts/clinical-service-resolution.ts.
//
// Groups every scope==="patient" RipsReadinessError by patientId, and
// reduces its (possibly several) error codes to the DISTINCT set of
// patients.PatientPatch fields actually missing — a patient with 3
// pendientes (sexo/tipo de usuario/país) produces ONE group with 3
// fields, never 3 separate corrections. A field never appears twice even
// if some future readiness rule produced the same code more than once for
// the same patient.
import type { RipsReadinessError } from "./export-readiness";
import type { PatientPatch } from "@/features/patients/actions";

// Only the PatientPatch keys a readiness code can ever point at — never
// firstName/lastName/phone/email, which no readiness rule checks.
// countryOfOriginCode IS checked (PATIENT_COUNTRY_ORIGIN_MISSING, U11) and
// was missing here, leaving that pendiente with no way to correct it.
export type PatientMissingField = Extract<
  keyof PatientPatch,
  | "documentType"
  | "documentNumber"
  | "birthDate"
  | "sexCode"
  | "userTypeCode"
  | "countryOfResidenceCode"
  | "municipalityOfResidenceCode"
  | "residenceZoneCode"
  | "countryOfOriginCode"
>;

// Human label for the modal's own field list — deliberately separate from
// export-readiness.ts's own per-error `message` text (that message is
// phrased as a sentence, "falta el sexo"; this is a short field name for
// a form label, "Sexo").
export const PATIENT_MISSING_FIELD_LABELS: Record<PatientMissingField, string> = {
  documentType: "Tipo de documento",
  documentNumber: "Número de documento",
  birthDate: "Fecha de nacimiento",
  sexCode: "Sexo",
  userTypeCode: "Tipo de usuario",
  countryOfResidenceCode: "País de residencia",
  municipalityOfResidenceCode: "Municipio de residencia",
  residenceZoneCode: "Zona de residencia",
  countryOfOriginCode: "País de origen",
};

const FIELD_BY_READINESS_CODE: Partial<Record<RipsReadinessError["code"], PatientMissingField>> = {
  PATIENT_DOCUMENT_TYPE_MISSING: "documentType",
  PATIENT_DOCUMENT_NUMBER_MISSING: "documentNumber",
  PATIENT_BIRTH_DATE_MISSING: "birthDate",
  PATIENT_SEX_MISSING: "sexCode",
  PATIENT_USER_TYPE_MISSING: "userTypeCode",
  PATIENT_COUNTRY_RESIDENCE_MISSING: "countryOfResidenceCode",
  PATIENT_MUNICIPALITY_MISSING: "municipalityOfResidenceCode",
  PATIENT_ZONE_MISSING: "residenceZoneCode",
  PATIENT_COUNTRY_ORIGIN_MISSING: "countryOfOriginCode",
};

export type PatientRipsGaps = {
  patientId: string;
  patientName: string;
  missingFields: PatientMissingField[];
};

// One group per DISTINCT patientId among scope==="patient" errors, in
// first-seen order — never one group per error. Any error whose code
// isn't in FIELD_BY_READINESS_CODE (there are none today, but scope is
// checked structurally, not by code, so this stays correct if a future
// patient-scope rule is added before this file is updated) is ignored
// for field purposes, never surfaced as a blank/unlabeled field.
export function groupPatientRipsGaps(errors: RipsReadinessError[]): PatientRipsGaps[] {
  const groups: PatientRipsGaps[] = [];
  const groupByPatientId = new Map<string, PatientRipsGaps>();

  for (const error of errors) {
    if (error.scope !== "patient" || !error.patientId) continue;
    const field = FIELD_BY_READINESS_CODE[error.code];
    if (!field) continue;

    let group = groupByPatientId.get(error.patientId);
    if (!group) {
      group = { patientId: error.patientId, patientName: error.patientName ?? "", missingFields: [] };
      groupByPatientId.set(error.patientId, group);
      groups.push(group);
    }
    if (!group.missingFields.includes(field)) group.missingFields.push(field);
  }

  return groups;
}
