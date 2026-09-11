// RIPS #5 — readiness in two levels (this task's own Section 3), kept
// entirely separate from RIPS #4's completeness.ts (which stays exactly
// as it was, still used by the encounter screen's own inline warnings —
// this module is new, for the export flow specifically, and returns the
// richer structured-error shape a real "RIPS" screen needs: a stable
// `code`, a `scope` for filtering/grouping, and a human `message`).
//
// Pure — no Supabase import, no `fetch`. Every check here is something
// ODENTIA CAN GUARANTEE from its own already-validated data (see
// export-generator.ts's own diagnosis-resolution reuse) — this is
// deliberately NOT a reimplementation of the MUV's 100+ regulatory
// validation rules (see this task's Section 19's own "Structural vs
// Regulatory/MUV validation" split, and Section 38's CUPSGrServicios
// decision below).

import { resolveDiagnosesForService, type GeneratorDiagnosis, type GeneratorService } from "./export-generator";

export type RipsReadinessScope = "clinic" | "location" | "patient" | "professional" | "encounter" | "service";

export type RipsReadinessErrorCode =
  | "CLINIC_TAX_ID_MISSING"
  | "LOCATION_MISSING"
  | "LOCATION_COD_PRESTADOR_MISSING"
  | "LOCATION_AMBIGUOUS"
  | "PATIENT_DOCUMENT_TYPE_MISSING"
  | "PATIENT_DOCUMENT_NUMBER_MISSING"
  | "PATIENT_BIRTH_DATE_MISSING"
  | "PATIENT_SEX_MISSING"
  | "PATIENT_USER_TYPE_MISSING"
  | "PATIENT_COUNTRY_RESIDENCE_MISSING"
  | "PATIENT_MUNICIPALITY_MISSING"
  | "PATIENT_ZONE_MISSING"
  | "PROFESSIONAL_DOCUMENT_MISSING"
  | "ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING"
  | "ENCOUNTER_SERVICE_MISSING"
  | "ENCOUNTER_INCAPACITY_MISSING"
  | "SERVICE_CUPS_UNCLASSIFIED"
  | "SERVICE_VALUE_MISSING"
  | "CONSULTATION_DIAGNOSIS_TYPE_MISSING";

export type RipsReadinessError = {
  code: RipsReadinessErrorCode;
  scope: RipsReadinessScope;
  message: string;
  patientId?: string;
  encounterId?: string;
  serviceId?: string;
  professionalProfileId?: string;
  locationId?: string;
  // A real route in this repo, or null when no natural fix screen exists
  // yet (see this task's own Section 28 — never an invented URL).
  fixHref: string | null;
};

export type RipsReadinessResult = {
  ready: boolean;
  errors: RipsReadinessError[];
};

function buildResult(errors: RipsReadinessError[]): RipsReadinessResult {
  return { ready: errors.length === 0, errors };
}

// ---------------------------------------------------------------------
// Encounter Readiness — "¿esta atención tiene todos los datos necesarios
// para convertirse en servicios RIPS válidos?"
// ---------------------------------------------------------------------
export type EncounterReadinessService = GeneratorService & {
  professionalHasDocumentIdentity: boolean;
};

export type EncounterReadinessInput = {
  encounterId: string;
  patientId: string;
  patientName: string;
  encounterDateLabel: string; // pre-formatted, e.g. "14/07/2026" — this module never formats dates itself
  incapacityCode: string | null;
  diagnoses: GeneratorDiagnosis[];
  services: EncounterReadinessService[];
};

export function getEncounterRipsReadiness(input: EncounterReadinessInput): RipsReadinessResult {
  const errors: RipsReadinessError[] = [];
  const base = { patientId: input.patientId, encounterId: input.encounterId };
  const encounterLabel = `Atención ${input.encounterDateLabel} de ${input.patientName}`;

  if (input.services.length === 0) {
    errors.push({
      ...base,
      code: "ENCOUNTER_SERVICE_MISSING",
      scope: "encounter",
      message: `${encounterLabel} — no tiene servicios (consultas o procedimientos) registrados.`,
      fixHref: null,
    });
  }

  if (!input.incapacityCode) {
    errors.push({
      ...base,
      code: "ENCOUNTER_INCAPACITY_MISSING",
      scope: "encounter",
      message: `${encounterLabel} — falta indicar si hubo incapacidad.`,
      fixHref: null,
    });
  }

  for (const service of input.services) {
    const serviceBase = { ...base, serviceId: service.id };

    if (service.ripsServiceType === "unknown") {
      errors.push({
        ...serviceBase,
        code: "SERVICE_CUPS_UNCLASSIFIED",
        scope: "service",
        message: `${encounterLabel} — el código CUPS ${service.cupsCode} no tiene clasificación oficial de consulta/procedimiento.`,
        fixHref: null,
      });
      // A service whose type can't be resolved can't be checked further
      // (its diagnosis requirement, its service_value rule) — those all
      // depend on knowing which one it is.
      continue;
    }

    const { principal } = resolveDiagnosesForService(input.diagnoses, service.id);
    if (!principal) {
      errors.push({
        ...serviceBase,
        code: "ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING",
        scope: "encounter",
        message: `${encounterLabel} — el servicio ${service.cupsCode} no tiene diagnóstico principal.`,
        fixHref: null,
      });
    } else if (service.ripsServiceType === "consultation" && !principal.diagnosisTypeCode) {
      // C14 tipoDiagnosticoPrincipal — obligatorio para TODA consulta
      // (Documento Técnico 1 v003: su columna Tamaño es "2", sin el
      // prefijo "0," que el propio documento usa consistentemente para
      // marcar cada campo condicional — nunca serializado como "" en su
      // lugar, ver export-generator.ts's own throw). No aplica a
      // procedimientos — el esquema no define un campo equivalente ahí.
      errors.push({
        ...serviceBase,
        code: "CONSULTATION_DIAGNOSIS_TYPE_MISSING",
        scope: "encounter",
        message: `${encounterLabel} — falta indicar si el diagnóstico principal de la consulta ${service.cupsCode} es confirmado o presuntivo.`,
        fixHref: null,
      });
    }

    if (service.ripsServiceType === "consultation" && service.serviceValue == null) {
      errors.push({
        ...serviceBase,
        code: "SERVICE_VALUE_MISSING",
        scope: "service",
        message: `${encounterLabel} — falta el valor cobrado por la consulta ${service.cupsCode}.`,
        fixHref: null,
      });
    }

    if (!service.professionalHasDocumentIdentity) {
      errors.push({
        ...serviceBase,
        professionalProfileId: service.professionalProfileId,
        code: "PROFESSIONAL_DOCUMENT_MISSING",
        scope: "professional",
        message: `${encounterLabel} — el profesional que realizó el servicio ${service.cupsCode} no tiene documento de identificación registrado.`,
        // No admin-facing fix route exists — professional document
        // identity is strictly self-service (update_my_professional_profile,
        // see RIPS #3) — never invent one.
        fixHref: null,
      });
    }
  }

  return buildResult(errors);
}

// ---------------------------------------------------------------------
// Export Readiness — "¿el conjunto completo tiene además la identidad y
// metadata necesaria para construir una transacción RIPS válida?"
// ---------------------------------------------------------------------
export type ExportReadinessLocation = { id: string; name: string; codPrestador: string | null };

export type ExportReadinessPatient = {
  patientId: string;
  patientName: string;
  documentType: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  sexCode: string | null;
  userTypeCode: string | null;
  countryOfResidenceCode: string | null;
  municipalityOfResidenceCode: string | null;
  residenceZoneCode: string | null;
};

export type RipsExportReadinessInput = {
  clinicTaxId: string | null;
  locations: ExportReadinessLocation[];
  patients: ExportReadinessPatient[];
  encounters: EncounterReadinessInput[];
};

function getPatientReadinessErrors(patient: ExportReadinessPatient): RipsReadinessError[] {
  const errors: RipsReadinessError[] = [];
  const base = { patientId: patient.patientId, fixHref: "/pacientes" };
  const label = `Paciente ${patient.patientName}`;

  if (!patient.documentType) {
    errors.push({ ...base, code: "PATIENT_DOCUMENT_TYPE_MISSING", scope: "patient", message: `${label} — falta el tipo de documento.` });
  }
  if (!patient.documentNumber) {
    errors.push({ ...base, code: "PATIENT_DOCUMENT_NUMBER_MISSING", scope: "patient", message: `${label} — falta el número de documento.` });
  }
  if (!patient.birthDate) {
    errors.push({ ...base, code: "PATIENT_BIRTH_DATE_MISSING", scope: "patient", message: `${label} — falta la fecha de nacimiento.` });
  }
  if (!patient.sexCode) {
    errors.push({ ...base, code: "PATIENT_SEX_MISSING", scope: "patient", message: `${label} — falta el sexo.` });
  }
  if (!patient.userTypeCode) {
    errors.push({ ...base, code: "PATIENT_USER_TYPE_MISSING", scope: "patient", message: `${label} — falta el tipo de usuario.` });
  }
  if (!patient.countryOfResidenceCode) {
    errors.push({ ...base, code: "PATIENT_COUNTRY_RESIDENCE_MISSING", scope: "patient", message: `${label} — falta el país de residencia.` });
  }
  // U07/U08 — condicional: solo obligatorio cuando reside en Colombia
  // (170), mismo criterio ya usado por RIPS #3's own completeness.ts.
  if (patient.countryOfResidenceCode === "170") {
    if (!patient.municipalityOfResidenceCode) {
      errors.push({ ...base, code: "PATIENT_MUNICIPALITY_MISSING", scope: "patient", message: `${label} — falta el municipio de residencia.` });
    }
    if (!patient.residenceZoneCode) {
      errors.push({ ...base, code: "PATIENT_ZONE_MISSING", scope: "patient", message: `${label} — falta la zona de residencia.` });
    }
  }
  return errors;
}

export function getRipsExportReadiness(input: RipsExportReadinessInput): RipsReadinessResult {
  const errors: RipsReadinessError[] = [];

  if (!input.clinicTaxId) {
    errors.push({
      code: "CLINIC_TAX_ID_MISSING",
      scope: "clinic",
      message: "La clínica no tiene NIT (numDocumentoIdObligado) registrado.",
      fixHref: "/clinica",
    });
  }

  // codPrestador (Section 14) — resolved from the SEDE, but nothing in
  // Odentia's current model links an appointment/encounter to a specific
  // clinic_location (appointments.room is a free-text catalog value, not
  // a location FK — confirmed by auditing both tables before writing this
  // check). When the clinic has exactly one location, using it is not a
  // guess — it's the only candidate. More than one location makes the
  // correct sede genuinely undeterminable per atención, so this blocks
  // rather than silently picking the primary one (this task's own
  // explicit instruction).
  if (input.locations.length === 0) {
    errors.push({ code: "LOCATION_MISSING", scope: "location", message: "La clínica no tiene ninguna sede registrada.", fixHref: "/clinica" });
  } else if (input.locations.length === 1) {
    const location = input.locations[0]!;
    if (!location.codPrestador) {
      errors.push({
        code: "LOCATION_COD_PRESTADOR_MISSING",
        scope: "location",
        locationId: location.id,
        message: `Sede ${location.name} — falta el código de prestador (codPrestador).`,
        fixHref: "/clinica",
      });
    }
  } else {
    errors.push({
      code: "LOCATION_AMBIGUOUS",
      scope: "location",
      message:
        "La clínica tiene más de una sede y Odentia todavía no registra en qué sede ocurrió cada atención — no es posible determinar el codPrestador de forma confiable.",
      fixHref: null,
    });
  }

  for (const patient of input.patients) {
    errors.push(...getPatientReadinessErrors(patient));
  }

  for (const encounter of input.encounters) {
    errors.push(...getEncounterRipsReadiness(encounter).errors);
  }

  return buildResult(errors);
}
