// "Nuevo paciente"'s own creation gate — the single source of truth both
// new-patient-modal.tsx's own `canCreate` (button) AND its "Falta
// completar…" footer message derive from. Pure and framework-free, same
// convention as encounter-finalize-readiness.ts/export-readiness.ts, so
// the exact rule ("Colombia exige municipio/zona, cualquier otro país
// no") is unit-testable without rendering the modal — and so the button
// and the message can never diverge (both call getMissingNewPatientFields
// under the hood, never a second independent check).
//
// This is a forward-only, Odentia-internal quality gate for NEW patients
// — never a DB constraint (every column here stays nullable) and never a
// duplicate of validate_patient_rips_identity (the Postgres trigger that
// already validates each code against its own official catalog on every
// INSERT/UPDATE) or of export-readiness.ts's own PATIENT_*_MISSING rules
// (untouched, still the defense for legacy/inconsistent patients via
// /rips's own correction flow).

// Same ISO 3166-1 numérico code PatientRecordModal/
// CompletePatientRipsDataModal already key off for their own U07/U08
// Colombia conditional — identifying Colombia by its official code,
// never by a label match.
export const COLOMBIA_CODE = "170";

export type NewPatientCompletenessInput = {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  phone: string;
  birthDate: string;
  sexCode: string;
  userTypeCode: string;
  countryOfResidenceCode: string;
  municipalityOfResidenceCode: string;
  residenceZoneCode: string;
};

// Stable identifiers — never the raw camelCase state field name surfaced
// verbatim to the odontóloga/asistente (see NEW_PATIENT_MISSING_FIELD_LABELS
// below for the human label each one maps to). Order matches the form's
// own field order, so a message built by simply mapping this array reads
// naturally top-to-bottom.
export type NewPatientMissingField =
  | "firstName"
  | "lastName"
  | "documentType"
  | "documentNumber"
  | "birthDate"
  | "sexCode"
  | "phone"
  | "userTypeCode"
  | "countryOfResidenceCode"
  | "municipalityOfResidenceCode"
  | "residenceZoneCode";

export const NEW_PATIENT_MISSING_FIELD_LABELS: Record<NewPatientMissingField, string> = {
  firstName: "Nombres",
  lastName: "Apellidos",
  documentType: "Tipo de documento",
  documentNumber: "Número de documento",
  birthDate: "Fecha de nacimiento",
  sexCode: "Sexo",
  phone: "Teléfono",
  userTypeCode: "Tipo de usuario",
  countryOfResidenceCode: "País de residencia",
  municipalityOfResidenceCode: "Municipio de residencia",
  residenceZoneCode: "Zona territorial",
};

// U07/U08 (Municipio/Zona) are only obligatorio when U06 (país) is
// Colombia (170) — same conditional export-readiness.ts's own
// PATIENT_MUNICIPALITY_MISSING/PATIENT_ZONE_MISSING already use, and the
// same reason Municipio's own catalog only contains Colombian (DANE)
// rows: a foreign-resident patient structurally has no valid code to
// pick here, so this is never asked of them.
export function requiresMunicipalityAndZone(countryOfResidenceCode: string): boolean {
  return countryOfResidenceCode === COLOMBIA_CODE;
}

// Correo is deliberately never checked here — it stays optional, exactly
// as today, never appearing in a missing-fields list.
export function getMissingNewPatientFields(input: NewPatientCompletenessInput): NewPatientMissingField[] {
  const missing: NewPatientMissingField[] = [];
  if (input.firstName.trim() === "") missing.push("firstName");
  if (input.lastName.trim() === "") missing.push("lastName");
  if (input.documentType === "") missing.push("documentType");
  if (input.documentNumber.trim() === "") missing.push("documentNumber");
  if (input.birthDate === "") missing.push("birthDate");
  if (input.sexCode === "") missing.push("sexCode");
  if (input.phone.trim() === "") missing.push("phone");
  if (input.userTypeCode === "") missing.push("userTypeCode");
  if (input.countryOfResidenceCode === "") missing.push("countryOfResidenceCode");
  if (requiresMunicipalityAndZone(input.countryOfResidenceCode)) {
    if (input.municipalityOfResidenceCode === "") missing.push("municipalityOfResidenceCode");
    if (input.residenceZoneCode === "") missing.push("residenceZoneCode");
  }
  return missing;
}

export function isNewPatientComplete(input: NewPatientCompletenessInput): boolean {
  return getMissingNewPatientFields(input).length === 0;
}
