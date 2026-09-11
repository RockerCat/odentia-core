// RIPS #5 — the pure generator: model → RIPS DTO → JSON. No Supabase
// import anywhere in this file (see this task's own Section 21 "Generador
// puro") — every fact it needs arrives already loaded as plain data via
// RipsExportGenerationInput, so the whole module is testable with zero DB
// connection (see export-generator.test.ts's golden fixture).
//
// Determinism (Section 22): every array below is explicitly sorted before
// being assigned a consecutivo — never PostgREST's own row order, never
// insertion order, never a UUID. Same input snapshot → byte-identical
// JSON.stringify(output, null, 2) output, every time.

import { formatFechaInicioAtencion, RIPS_EXPORT_TIMEZONE } from "./export-datetime";
import type { RipsConsultation, RipsProcedure, RipsSinFacturaTransaction, RipsUser } from "./export-types";

export type GeneratorDiagnosis = {
  cie10Code: string;
  role: "principal" | "related";
  diagnosisTypeCode: string | null;
  encounterServiceId: string | null;
  sequence: number;
};

export type GeneratorService = {
  id: string;
  cupsCode: string;
  ripsServiceType: "consultation" | "procedure" | "unknown";
  performedAtUtc: string;
  serviceValue: number | null;
  viaIngresoCode: string | null;
  modalidadCode: string | null;
  grupoServiciosCode: string | null;
  codServicioCode: string | null;
  finalidadCode: string | null;
  causaMotivoCode: string | null;
  conceptoRecaudoCode: string | null;
  valorPagoModerador: number | null;
  sequence: number;
  professionalProfileId: string;
};

export type GeneratorEncounter = {
  encounterId: string;
  patientId: string;
  // U09 incapacidad — required, never defaulted here: readiness (see
  // export-readiness.ts) blocks generation for any encounter still
  // missing it, exactly like a missing principal diagnosis. Silently
  // defaulting an unset incapacidad to "02" (NO) would be inventing a
  // regulatory fact Odentia doesn't actually have (see this task's own
  // "no inventes datos faltantes").
  incapacityCode: string;
  diagnoses: GeneratorDiagnosis[];
  services: GeneratorService[];
};

export type GeneratorPatient = {
  patientId: string;
  documentType: string;
  documentNumber: string;
  birthDate: string;
  sexCode: string;
  userTypeCode: string;
  countryOfResidenceCode: string;
  municipalityOfResidenceCode: string | null;
  residenceZoneCode: string | null;
  countryOfOriginCode: string | null;
};

export type GeneratorProfessional = {
  professionalProfileId: string;
  documentType: string;
  documentNumber: string;
};

export type GeneratorLocation = {
  codPrestador: string;
  timezone: string;
};

export type RipsExportGenerationInput = {
  numDocumentoIdObligado: string;
  location: GeneratorLocation;
  encounters: GeneratorEncounter[];
  patientsById: Map<string, GeneratorPatient>;
  professionalsById: Map<string, GeneratorProfessional>;
};

// ---------------------------------------------------------------------
// Diagnosis resolution (Section 12) — shared by the generator AND
// readiness.ts, so "readiness says ready" and "the generator can actually
// produce a valid consulta/procedimiento" can never disagree.
//
// Principal: a diagnosis scoped to THIS service (encounterServiceId ===
// service.id) wins if one exists; otherwise the encounter-wide principal
// (encounterServiceId === null) applies. Never both, never neither once
// readiness has passed — see encounter_diagnoses_one_principal_per_scope's
// own migration comment for why at most one can exist per scope.
//
// Related: the UNION of this service's own scoped related diagnoses and
// the encounter-wide ones, deduplicated by cie10_code (a service-specific
// diagnosis never re-lists a code the encounter-wide list already
// carries), ordered by `sequence` (stable, deterministic — never
// arbitrary). Truncation to the JSON's fixed slot count (3 for
// consultas, 1 for procedimientos) happens at the call site below, not
// here — this resolver always returns the FULL deduplicated list so a
// caller can decide whether truncation actually drops anything (see
// GeneratorWarning below).
// ---------------------------------------------------------------------
export function resolveDiagnosesForService(
  diagnoses: GeneratorDiagnosis[],
  serviceId: string,
): { principal: GeneratorDiagnosis | null; related: GeneratorDiagnosis[] } {
  const scoped = diagnoses.filter((d) => d.encounterServiceId === serviceId);
  const wide = diagnoses.filter((d) => d.encounterServiceId === null);

  const principal = scoped.find((d) => d.role === "principal") ?? wide.find((d) => d.role === "principal") ?? null;

  const relatedCandidates = [...scoped.filter((d) => d.role === "related"), ...wide.filter((d) => d.role === "related")].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const seenCodes = new Set<string>();
  const related: GeneratorDiagnosis[] = [];
  for (const d of relatedCandidates) {
    if (seenCodes.has(d.cie10Code)) continue;
    seenCodes.add(d.cie10Code);
    related.push(d);
  }
  return { principal, related };
}

export type GeneratorWarning = {
  code: "RELATED_DIAGNOSES_TRUNCATED";
  encounterId: string;
  serviceId: string;
  message: string;
};

// vrServicio/valorPagoModerador must reach the JSON as plain numbers
// (Postgres `numeric` arrives from Supabase as a JS `number` for values in
// COP's realistic range — see this task's own Section 17) — this helper
// exists so a stray string ("1234.56", from a driver edge case) is
// coerced explicitly rather than silently serialized as a JSON string.
function toMoneyNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function buildConsultation(
  encounter: GeneratorEncounter,
  service: GeneratorService,
  input: RipsExportGenerationInput,
  consecutivo: number,
  warnings: GeneratorWarning[],
): RipsConsultation {
  const professional = input.professionalsById.get(service.professionalProfileId);
  if (!professional) {
    throw new Error(`professional ${service.professionalProfileId} not found in professionalsById (readiness should have blocked this)`);
  }
  const { principal, related } = resolveDiagnosesForService(encounter.diagnoses, service.id);
  if (!principal) {
    throw new Error(`service ${service.id} has no resolvable principal diagnosis (readiness should have blocked this)`);
  }
  // C14 tipoDiagnosticoPrincipal is mandatory for every consulta (see
  // export-readiness.ts's own CONSULTATION_DIAGNOSIS_TYPE_MISSING check,
  // which must have already blocked generation if this is missing) —
  // never silently serialized as "" in its place.
  if (!principal.diagnosisTypeCode) {
    throw new Error(`consultation service ${service.id} has no diagnosisTypeCode (readiness should have blocked this)`);
  }
  if (related.length > 3) {
    warnings.push({
      code: "RELATED_DIAGNOSES_TRUNCATED",
      encounterId: encounter.encounterId,
      serviceId: service.id,
      message: `El servicio ${service.cupsCode} tiene ${related.length} diagnósticos relacionados; el RIPS de consulta solo admite 3 — se incluyeron los primeros 3.`,
    });
  }
  const [related1, related2, related3] = related;

  return {
    codPrestador: input.location.codPrestador,
    fechaInicioAtencion: formatFechaInicioAtencion(service.performedAtUtc, input.location.timezone),
    numAutorizacion: null,
    codConsulta: service.cupsCode,
    modalidadGrupoServicioTecSal: service.modalidadCode,
    grupoServicios: service.grupoServiciosCode,
    codServicio: service.codServicioCode,
    finalidadTecnologiaSalud: service.finalidadCode,
    causaMotivoAtencion: service.causaMotivoCode,
    codDiagnosticoPrincipal: principal.cie10Code,
    codDiagnosticoPrincipalCIE11: null,
    nomCodDiagnosticoPrincipalCIE11: null,
    codDiagnosticoRelacionado1: related1?.cie10Code ?? null,
    codDiagnosticoRelacionado1CIE11: null,
    nomCodDiagnosticoRelacionado1CIE11: null,
    codDiagnosticoRelacionado2: related2?.cie10Code ?? null,
    codDiagnosticoRelacionado2CIE11: null,
    nomCodDiagnosticoRelacionado2CIE11: null,
    codDiagnosticoRelacionado3: related3?.cie10Code ?? null,
    codDiagnosticoRelacionado3CIE11: null,
    nomCodDiagnosticoRelacionado3CIE11: null,
    tipoDiagnosticoPrincipal: principal.diagnosisTypeCode,
    tipoDocumentoIdentificacion: professional.documentType,
    numDocumentoIdentificacion: professional.documentNumber,
    vrServicio: toMoneyNumber(service.serviceValue ?? 0),
    conceptoRecaudo: service.conceptoRecaudoCode,
    valorPagoModerador: toMoneyNumber(service.valorPagoModerador ?? 0),
    numFEVPagoModerador: null,
    consecutivo,
    codigoVIDA: null,
  };
}

function buildProcedure(
  encounter: GeneratorEncounter,
  service: GeneratorService,
  input: RipsExportGenerationInput,
  consecutivo: number,
  warnings: GeneratorWarning[],
): RipsProcedure {
  const professional = input.professionalsById.get(service.professionalProfileId);
  if (!professional) {
    throw new Error(`professional ${service.professionalProfileId} not found in professionalsById (readiness should have blocked this)`);
  }
  const { principal, related } = resolveDiagnosesForService(encounter.diagnoses, service.id);
  if (!principal) {
    throw new Error(`service ${service.id} has no resolvable principal diagnosis (readiness should have blocked this)`);
  }
  if (related.length > 1) {
    warnings.push({
      code: "RELATED_DIAGNOSES_TRUNCATED",
      encounterId: encounter.encounterId,
      serviceId: service.id,
      message: `El servicio ${service.cupsCode} tiene ${related.length} diagnósticos relacionados; el RIPS de procedimiento solo admite 1 — se incluyó el primero.`,
    });
  }

  return {
    codPrestador: input.location.codPrestador,
    fechaInicioAtencion: formatFechaInicioAtencion(service.performedAtUtc, input.location.timezone),
    idMIPRES: null,
    numAutorizacion: null,
    codProcedimiento: service.cupsCode,
    viaIngresoServicioSalud: service.viaIngresoCode,
    modalidadGrupoServicioTecSal: service.modalidadCode,
    grupoServicios: service.grupoServiciosCode,
    codServicio: service.codServicioCode,
    finalidadTecnologiaSalud: service.finalidadCode,
    tipoDocumentoIdentificacion: professional.documentType,
    numDocumentoIdentificacion: professional.documentNumber,
    codDiagnosticoPrincipal: principal.cie10Code,
    codDiagnosticoPrincipalCIE11: null,
    nomCodDiagnosticoPrincipalCIE11: null,
    codDiagnosticoRelacionado: related[0]?.cie10Code ?? null,
    codDiagnosticoRelacionadoCIE11: null,
    nomCodDiagnosticoRelacionadoCIE11: null,
    codComplicacion: null,
    vrServicio: toMoneyNumber(service.serviceValue ?? 0),
    conceptoRecaudo: service.conceptoRecaudoCode,
    valorPagoModerador: toMoneyNumber(service.valorPagoModerador ?? 0),
    numFEVPagoModerador: null,
    consecutivo,
    codigoVIDA: null,
  };
}

// ---------------------------------------------------------------------
// Usuarios grouping (Section 8) — see export-types.ts's own RipsUser
// comment for the full normative citation. Key = `${patientId}::${
// incapacityCode ?? "none"}`; every encounter for the same patient sharing
// the same incapacityCode merges into one usuario entry.
// ---------------------------------------------------------------------
function groupKey(patientId: string, incapacityCode: string): string {
  return `${patientId}::${incapacityCode}`;
}

export function buildRipsSinFacturaTransaction(
  input: RipsExportGenerationInput,
): { transaction: RipsSinFacturaTransaction; warnings: GeneratorWarning[] } {
  const warnings: GeneratorWarning[] = [];

  // Deterministic encounter order FIRST (by occurred_at via the service's
  // own performedAtUtc as a stable proxy, then encounterId) — this is what
  // makes "which usuario group a patient's later-vs-earlier atenciones
  // land in" reproducible run over run, independent of any DB SELECT
  // order.
  const sortedEncounters = [...input.encounters].sort((a, b) => {
    const aFirst = a.services[0]?.performedAtUtc ?? "";
    const bFirst = b.services[0]?.performedAtUtc ?? "";
    return aFirst < bFirst ? -1 : aFirst > bFirst ? 1 : a.encounterId.localeCompare(b.encounterId);
  });

  const groups = new Map<string, { patientId: string; incapacityCode: string; encounters: GeneratorEncounter[] }>();
  for (const encounter of sortedEncounters) {
    const key = groupKey(encounter.patientId, encounter.incapacityCode);
    const existing = groups.get(key);
    if (existing) {
      existing.encounters.push(encounter);
    } else {
      groups.set(key, { patientId: encounter.patientId, incapacityCode: encounter.incapacityCode, encounters: [encounter] });
    }
  }

  // Deterministic usuario order: patientId, then incapacityCode — never
  // Map insertion order (which here does follow encounter order, but
  // pinning it explicitly makes the guarantee independent of the loop
  // above ever changing).
  const sortedGroupEntries = Array.from(groups.values()).sort((a, b) => {
    const byPatient = a.patientId.localeCompare(b.patientId);
    return byPatient !== 0 ? byPatient : a.incapacityCode.localeCompare(b.incapacityCode);
  });

  const usuarios: RipsUser[] = sortedGroupEntries.map((group, groupIndex) => {
    const patient = input.patientsById.get(group.patientId);
    if (!patient) {
      throw new Error(`patient ${group.patientId} not found in patientsById (readiness should have blocked this)`);
    }

    const consultas: RipsConsultation[] = [];
    const procedimientos: RipsProcedure[] = [];
    for (const encounter of group.encounters) {
      const sortedServices = [...encounter.services].sort((a, b) => a.sequence - b.sequence);
      for (const service of sortedServices) {
        if (service.ripsServiceType === "consultation") {
          consultas.push(buildConsultation(encounter, service, input, consultas.length + 1, warnings));
        } else if (service.ripsServiceType === "procedure") {
          procedimientos.push(buildProcedure(encounter, service, input, procedimientos.length + 1, warnings));
        }
        // 'unknown' never reaches here — readiness blocks export while any
        // service has an unresolved CUPS classification.
      }
    }

    return {
      tipoDocumentoIdentificacion: patient.documentType,
      numDocumentoIdentificacion: patient.documentNumber,
      tipoUsuario: patient.userTypeCode,
      fechaNacimiento: patient.birthDate,
      codSexo: patient.sexCode,
      codPaisResidencia: patient.countryOfResidenceCode,
      codMunicipioResidencia: patient.municipalityOfResidenceCode,
      codZonaTerritorialResidencia: patient.residenceZoneCode,
      incapacidad: group.incapacityCode,
      consecutivo: groupIndex + 1,
      codPaisOrigen: patient.countryOfOriginCode,
      registroSIRAS: null,
      servicios: {
        ...(consultas.length > 0 ? { consultas } : {}),
        ...(procedimientos.length > 0 ? { procedimientos } : {}),
      },
    };
  });

  const transaction: RipsSinFacturaTransaction = {
    numDocumentoIdObligado: input.numDocumentoIdObligado,
    numFactura: null,
    tipoNota: null,
    numNota: null,
    usuarios,
  };

  return { transaction, warnings };
}

export function serializeRipsSinFacturaTransaction(transaction: RipsSinFacturaTransaction): string {
  return JSON.stringify(transaction, null, 2);
}

export function getRipsExportFilename(period: { year: number; month: number }): string {
  return `RIPS_Sin_Factura_${period.year}-${String(period.month).padStart(2, "0")}.json`;
}

export { RIPS_EXPORT_TIMEZONE };
