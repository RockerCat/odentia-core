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
  | "PATIENT_COUNTRY_ORIGIN_MISSING"
  | "PROFESSIONAL_DOCUMENT_MISSING"
  | "ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING"
  | "ENCOUNTER_SERVICE_MISSING"
  | "ENCOUNTER_INCAPACITY_MISSING"
  | "SERVICE_CUPS_UNCLASSIFIED"
  | "SERVICE_VALUE_MISSING"
  | "SERVICE_FINALIDAD_MISSING"
  | "SERVICE_MODALIDAD_MISSING"
  | "SERVICE_VIA_INGRESO_MISSING"
  | "CONSULTATION_DIAGNOSIS_TYPE_MISSING"
  | "CONSULTATION_CAUSA_MOTIVO_MISSING"
  | "CLINICAL_SERVICE_MAPPING_UNRESOLVED"
  | "RIPS_SERVICE_CONFIGURATION_MISSING";

export type RipsReadinessError = {
  code: RipsReadinessErrorCode;
  scope: RipsReadinessScope;
  message: string;
  patientId?: string;
  // Only ever set for scope === "patient" errors (see
  // getPatientReadinessErrors) — encounter/service-scope errors already
  // fold the patient's name into their own `message` text instead
  // (encounterLabel), so this stays undefined there rather than
  // duplicating it as a second, possibly-drifting source. Exists so a
  // patient-scope correction UI (e.g. the RIPS screen's own "Corregir")
  // can group/label by patient without parsing it back out of `message`.
  patientName?: string;
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
  // RIPS #A3 — set only for a service captured via the "¿Qué realizaste?"
  // clinical concept picker (clinical-service-resolution.ts); null for any
  // service added via the manual CUPS search. Only gates
  // CLINICAL_SERVICE_MAPPING_UNRESOLVED below (a concept-picker-only
  // failure mode) — RIPS_SERVICE_CONFIGURATION_MISSING no longer depends
  // on it (see that check's own comment: closing the Manual CUPS gap made
  // both paths share the same Grupo/Servicio resolution).
  clinicalConceptId: string | null;
  mappingStatus: "resolved" | "unresolved" | null;
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
      // Narrow correction screen (see encounter-correction-actions.ts) —
      // never the full clinical encounter screen: a finalized atención's
      // historia clínica stays immutable, only this specific RIPS gap is
      // editable there.
      fixHref: `/rips/atencion/${input.encounterId}`,
    });
  }

  for (const service of input.services) {
    const serviceBase = { ...base, serviceId: service.id };

    // RIPS #A3 — two distinct causes, never mixed into one message (see
    // this task's own instruction): a concept the picker couldn't map to
    // any active CUPS ("unresolved" — a future-phase state; this phase's
    // UI never lets it happen, but readiness still recognizes it) is a
    // DIFFERENT problem from a service whose specialty has no Servicio
    // RIPS confirmed yet by the clinic. Both are scoped to "service" (not
    // "clinic"): fixing LOCATION_AMBIGUOUS-style clinic config doesn't fix
    // a specific service's missing mapping.
    if (service.mappingStatus === "unresolved") {
      errors.push({
        ...serviceBase,
        code: "CLINICAL_SERVICE_MAPPING_UNRESOLVED",
        scope: "service",
        message: `${encounterLabel} — el concepto clínico seleccionado no tiene un CUPS resuelto todavía.`,
        fixHref: null,
      });
    }

    // RIPS closing Manual CUPS gap (2026-09-21): both service-creation
    // paths (the "¿Qué realizaste?" concept picker AND manual CUPS
    // search) now resolve Grupo/Servicio the exact same way —
    // resolveClinicSpecialtyRipsService, keyed only by the attending
    // professional's specialty (see real-clinical-encounter-screen.tsx's
    // addService/addConceptService) — so a still-missing codServicioCode
    // means the exact same root cause regardless of clinicalConceptId:
    // the clinic hasn't confirmed a Servicio RIPS for that specialty yet.
    // No longer gated on `service.clinicalConceptId` — that gate is what
    // let a Manual CUPS row structurally bypass this check before.
    if (!service.codServicioCode) {
      errors.push({
        ...serviceBase,
        code: "RIPS_SERVICE_CONFIGURATION_MISSING",
        scope: "service",
        message: `${encounterLabel} — la clínica todavía no ha confirmado el Servicio RIPS para la especialidad de este servicio.`,
        // Closest existing route (Configuración RIPS de la clínica) — no
        // UI to confirm clinic_specialty_rips_services exists yet (that's
        // A4's own scope); never inventing one here.
        fixHref: "/clinica#rips",
      });
    }

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
        // Same narrow correction screen as ENCOUNTER_INCAPACITY_MISSING
        // above — one screen per encounter handles every RIPS gap that
        // encounter has, never one screen per individual field.
        fixHref: `/rips/atencion/${input.encounterId}`,
      });
    }

    // RIPS #5B — finalidadTecnologiaSalud (C08 consulta / P10
    // procedimiento) and causaMotivoAtencion (C09, consulta only — DT1
    // v003 defines no equivalent field for procedimientos) are both
    // declared with a bare fixed Tamaño "2" (never "0-2", never a
    // comma-list including 0) — DT1 v003 §1.5's own rule for a fixed-size
    // field ("no admiten información con otro número de posición
    // diferente a la que se establece") means neither can be exported as
    // null, unlike Modalidad/ConceptoRecaudo/CodServicio elsewhere in
    // this same service, which genuinely are variable-size-with-0-minimum
    // and stay untouched here. A NEW service can never reach this state —
    // getEncounterFinalizeBlockers (dashboard/encounter-finalize-readiness.ts)
    // already requires both before "Finalizar atención" — so these two
    // checks only ever fire for an encounter finalized before that gate
    // existed. No default/inference here either: readiness identifies the
    // gap, it never prescribes a value (never "usa 40"/"usa 38") — same
    // convention as every other readiness check in this file.
    if (!service.finalidadCode) {
      errors.push({
        ...serviceBase,
        code: "SERVICE_FINALIDAD_MISSING",
        scope: "service",
        message: `${encounterLabel} — falta indicar la finalidad de ${service.ripsServiceType === "consultation" ? "la consulta" : "el procedimiento"} ${service.cupsCode}.`,
        // fixHref stays null on purpose, same as RIPS_SERVICE_CONFIGURATION_MISSING
        // above: the real correction screen (CompleteEncounterRipsFieldModal,
        // via correct_encounter_service_rips_field()) is opened by
        // rips-screen.tsx matching this error's own `code`
        // (encounter-rips-field-gaps.ts), never by navigating a URL —
        // never point at /rips/atencion/[encounterId] either, which only
        // ever corrects incapacidad/valor cobrado (RIPS #6D), not this.
        fixHref: null,
      });
    }

    if (service.ripsServiceType === "consultation" && !service.causaMotivoCode) {
      errors.push({
        ...serviceBase,
        code: "CONSULTATION_CAUSA_MOTIVO_MISSING",
        scope: "service",
        message: `${encounterLabel} — falta indicar la causa o motivo de la consulta ${service.cupsCode}.`,
        fixHref: null,
      });
    }

    // C05/P07 modalidadGrupoServicioTecSal — DT1 v003 declares a bare
    // fixed Tamaño "2" (§1.5's own fixed-size-admits-no-null rule, same
    // one already applied to Finalidad/Causa), for both consulta and
    // procedimiento. Every real service-creation path already hardcodes
    // "01" here unconditionally (real-clinical-encounter-screen.tsx's
    // addService/addConceptService, no manual selector exists) — this
    // can only ever fire for a historical encounter finalized before
    // that rule existed. No correction mechanism exists for this gap
    // yet — fixHref stays null, same as every other not-yet-correctable
    // gap in this file.
    if (!service.modalidadCode) {
      errors.push({
        ...serviceBase,
        code: "SERVICE_MODALIDAD_MISSING",
        scope: "service",
        message: `${encounterLabel} — falta indicar la modalidad de ${service.ripsServiceType === "consultation" ? "la consulta" : "el procedimiento"} ${service.cupsCode}.`,
        fixHref: null,
      });
    }

    // P06 viaIngresoServicioSalud — RIPS closing checkpoint (2026-09-21).
    // DT1 v003 declares a bare fixed Tamaño "2", and defines this field
    // ONLY for a procedimiento (never a consulta — see RipsConsultation,
    // export-types.ts, and encounter_services' own DB CHECK constraint).
    // Official finding: Odentia's Agenda has exactly one real appointment
    // entry path (a scheduled Cita), so "02 Consulta Externa ó
    // Programada" is the only RIPSViaIngresoIPS code Odentia's own domain
    // model can ever honestly assert — every real procedure-creation path
    // now resolves it automatically (resolveViaIngresoCode,
    // clinical-service-resolution.ts, same "structural default, never a
    // manual selector" treatment as Modalidad above). This can only ever
    // fire for a historical procedimiento finalized before that rule
    // existed. No correction mechanism exists for this gap yet — fixHref
    // stays null, same as SERVICE_MODALIDAD_MISSING above.
    if (service.ripsServiceType === "procedure" && !service.viaIngresoCode) {
      errors.push({
        ...serviceBase,
        code: "SERVICE_VIA_INGRESO_MISSING",
        scope: "service",
        message: `${encounterLabel} — falta indicar la vía de ingreso del procedimiento ${service.cupsCode}.`,
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
  countryOfOriginCode: string | null;
};

export type RipsExportReadinessInput = {
  clinicTaxId: string | null;
  locations: ExportReadinessLocation[];
  patients: ExportReadinessPatient[];
  encounters: EncounterReadinessInput[];
};

function getPatientReadinessErrors(patient: ExportReadinessPatient): RipsReadinessError[] {
  const errors: RipsReadinessError[] = [];
  const base = { patientId: patient.patientId, patientName: patient.patientName, fixHref: "/pacientes" };
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
  // U11 codPaisOrigen — DT1 v003 declares a bare fixed Tamaño "3" (never
  // "0, 3"), same §1.5 fixed-size rule already applied to Finalidad/
  // Causa/codPaisOrigen's own schema check — unconditional, unlike
  // Municipio/Zona above. No existing UI writes this field yet (checked:
  // no /pacientes form references it) — fixHref still points at
  // /pacientes, the same general patient-edit surface every other
  // patient-scope gap here already uses, even though this specific field
  // has no dedicated control there today.
  if (!patient.countryOfOriginCode) {
    errors.push({ ...base, code: "PATIENT_COUNTRY_ORIGIN_MISSING", scope: "patient", message: `${label} — falta el país de origen.` });
  }
  return errors;
}

export function getRipsExportReadiness(input: RipsExportReadinessInput): RipsReadinessResult {
  const errors: RipsReadinessError[] = [];

  if (!input.clinicTaxId) {
    errors.push({
      code: "CLINIC_TAX_ID_MISSING",
      scope: "clinic",
      message: "La clínica no tiene NIT registrado.",
      fixHref: "/clinica#rips",
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
    errors.push({
      code: "LOCATION_MISSING",
      scope: "location",
      message: "La clínica no tiene ninguna sede registrada.",
      fixHref: "/clinica#rips",
    });
  } else if (input.locations.length === 1) {
    const location = input.locations[0]!;
    if (!location.codPrestador) {
      errors.push({
        code: "LOCATION_COD_PRESTADOR_MISSING",
        scope: "location",
        locationId: location.id,
        message: `${location.name} — falta el código de habilitación (REPS).`,
        fixHref: "/clinica#rips",
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
