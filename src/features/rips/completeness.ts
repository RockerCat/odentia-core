// Odentia Core — RIPS #3: identity-readiness helpers.
//
// Pure functions only — no DB access, no JSON generation. Each answers
// "does this record have the minimum identity data RIPS will eventually
// need" and returns which fields are missing, structured, so a future
// screen/report can point at exactly what to complete. Deliberately NOT a
// "is this ready to submit RIPS" module (periods/batches/JSON/CUV/MUV are
// explicitly out of scope for this phase — see the RIPS #3 report).

export type RipsIdentityCompleteness = {
  complete: boolean;
  missingFields: string[];
};

function buildResult(missingFields: string[]): RipsIdentityCompleteness {
  return { complete: missingFields.length === 0, missingFields };
}

// Documento Técnico 1, campos T01 (numDocumentoIdObligado, en
// clinics.tax_id) y C01/P01 (codPrestador, en clinic_locations.cod_prestador
// — un dato por sede, nunca por clínica, ver la migración que agrega esa
// columna). Ambos son necesarios para identificar al prestador en RIPS.
export function getClinicLocationRipsIdentityCompleteness(input: {
  clinicTaxId: string | null;
  codPrestador: string | null;
}): RipsIdentityCompleteness {
  const missingFields: string[] = [];
  if (!input.clinicTaxId) missingFields.push("clinicTaxId");
  if (!input.codPrestador) missingFields.push("codPrestador");
  return buildResult(missingFields);
}

// Identidad documental del profesional (document_type/document_number en
// professional_profiles) — ver la migración que agrega esas columnas para
// por qué esto es un par estructurado, nunca un solo string.
export function getProfessionalRipsIdentityCompleteness(input: {
  documentType: string | null;
  documentNumber: string | null;
}): RipsIdentityCompleteness {
  const missingFields: string[] = [];
  if (!input.documentType) missingFields.push("documentType");
  if (!input.documentNumber) missingFields.push("documentNumber");
  return buildResult(missingFields);
}

// Campos U01-U08 del Documento Técnico 1 (usuarios[]). Deliberadamente NO
// incluye U09 incapacidad: ese campo describe un hecho de LA ATENCIÓN
// reportada ("identificador de la expedición de una incapacidad
// soportada en la atención en salud que se reporta en RIPS"), no un dato
// estable del paciente — pertenece a una futura fase de datos clínicos
// estructurados/generación de JSON (RIPS #4), nunca a esta tabla. U11
// codPaisOrigen tampoco se exige aquí: el Documento Técnico 1 no lo marca
// obligatorio de forma incondicional como sí lo hace con los campos de
// abajo, así que su ausencia no cuenta como incompletitud todavía.
export function getPatientRipsIdentityCompleteness(input: {
  documentType: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  sexCode: string | null;
  userTypeCode: string | null;
  countryOfResidenceCode: string | null;
  municipalityOfResidenceCode: string | null;
  residenceZoneCode: string | null;
}): RipsIdentityCompleteness {
  const missingFields: string[] = [];
  if (!input.documentType) missingFields.push("documentType");
  if (!input.documentNumber) missingFields.push("documentNumber");
  if (!input.birthDate) missingFields.push("birthDate");
  if (!input.sexCode) missingFields.push("sexCode");
  if (!input.userTypeCode) missingFields.push("userTypeCode");
  if (!input.countryOfResidenceCode) missingFields.push("countryOfResidenceCode");

  // U07/U08: "Obligatorio cuando el campo codPaisResidencia sea igual a
  // 170" (Colombia) — condicional, nunca exigido para un residente en el
  // exterior.
  if (input.countryOfResidenceCode === "170") {
    if (!input.municipalityOfResidenceCode) missingFields.push("municipalityOfResidenceCode");
    if (!input.residenceZoneCode) missingFields.push("residenceZoneCode");
  }

  return buildResult(missingFields);
}
