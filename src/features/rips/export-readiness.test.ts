import { describe, expect, it } from "vitest";
import {
  getEncounterRipsReadiness,
  getRipsExportReadiness,
  type EncounterReadinessInput,
  type ExportReadinessPatient,
} from "./export-readiness";
import type { GeneratorDiagnosis } from "./export-generator";

function principalDiag(overrides: Partial<GeneratorDiagnosis> = {}): GeneratorDiagnosis {
  return { cie10Code: "K021", role: "principal", diagnosisTypeCode: "01", encounterServiceId: null, sequence: 0, ...overrides };
}

function baseService(overrides: Partial<EncounterReadinessInput["services"][number]> = {}): EncounterReadinessInput["services"][number] {
  return {
    id: "svc-1",
    cupsCode: "890201",
    ripsServiceType: "consultation",
    performedAtUtc: "2026-07-05T13:00:00.000Z",
    serviceValue: 50000,
    viaIngresoCode: null,
    modalidadCode: null,
    grupoServiciosCode: null,
    codServicioCode: null,
    finalidadCode: null,
    causaMotivoCode: null,
    conceptoRecaudoCode: null,
    valorPagoModerador: null,
    sequence: 0,
    professionalProfileId: "prof-1",
    professionalHasDocumentIdentity: true,
    ...overrides,
  };
}

function baseEncounter(overrides: Partial<EncounterReadinessInput> = {}): EncounterReadinessInput {
  return {
    encounterId: "enc-1",
    patientId: "patient-1",
    patientName: "Laura Gómez",
    encounterDateLabel: "05/07/2026",
    incapacityCode: "02",
    diagnoses: [principalDiag()],
    services: [baseService()],
    ...overrides,
  };
}

describe("getEncounterRipsReadiness", () => {
  it("is ready when principal diagnosis, service, incapacity, and professional identity are all present", () => {
    expect(getEncounterRipsReadiness(baseEncounter())).toEqual({ ready: true, errors: [] });
  });

  it("flags a missing service", () => {
    const result = getEncounterRipsReadiness(baseEncounter({ services: [] }));
    expect(result.ready).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("ENCOUNTER_SERVICE_MISSING");
  });

  it("flags a missing principal diagnosis for a service that can't resolve one", () => {
    const result = getEncounterRipsReadiness(baseEncounter({ diagnoses: [] }));
    expect(result.errors.map((e) => e.code)).toContain("ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING");
  });

  it("flags an unclassified (unknown) CUPS service", () => {
    const result = getEncounterRipsReadiness(baseEncounter({ services: [baseService({ ripsServiceType: "unknown" })] }));
    expect(result.errors.map((e) => e.code)).toEqual(["SERVICE_CUPS_UNCLASSIFIED"]);
  });

  it("flags a missing service_value only for a consultation", () => {
    const result = getEncounterRipsReadiness(baseEncounter({ services: [baseService({ serviceValue: null })] }));
    expect(result.errors.map((e) => e.code)).toContain("SERVICE_VALUE_MISSING");
  });

  it("never flags service_value for a procedure, even when null (0 is the regulatory default)", () => {
    const result = getEncounterRipsReadiness(
      baseEncounter({ services: [baseService({ ripsServiceType: "procedure", serviceValue: null, cupsCode: "230100" })] }),
    );
    expect(result.errors.map((e) => e.code)).not.toContain("SERVICE_VALUE_MISSING");
  });

  it("flags a missing professional document identity", () => {
    const result = getEncounterRipsReadiness(baseEncounter({ services: [baseService({ professionalHasDocumentIdentity: false })] }));
    expect(result.errors.map((e) => e.code)).toContain("PROFESSIONAL_DOCUMENT_MISSING");
  });

  it("flags a missing incapacity", () => {
    const result = getEncounterRipsReadiness(baseEncounter({ incapacityCode: null }));
    expect(result.errors.map((e) => e.code)).toContain("ENCOUNTER_INCAPACITY_MISSING");
  });

  it("resolves a service-scoped principal diagnosis, not just the encounter-wide one", () => {
    const result = getEncounterRipsReadiness(
      baseEncounter({
        diagnoses: [principalDiag({ encounterServiceId: "svc-1" })],
      }),
    );
    expect(result.ready).toBe(true);
  });

  it("flags a consultation's principal diagnosis missing tipoDiagnosticoPrincipal (C14, mandatory for every consulta)", () => {
    const result = getEncounterRipsReadiness(baseEncounter({ diagnoses: [principalDiag({ diagnosisTypeCode: null })] }));
    expect(result.ready).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("CONSULTATION_DIAGNOSIS_TYPE_MISSING");
  });

  it("is ready when the consultation's principal diagnosis has a valid tipoDiagnosticoPrincipal", () => {
    const result = getEncounterRipsReadiness(baseEncounter({ diagnoses: [principalDiag({ diagnosisTypeCode: "01" })] }));
    expect(result.ready).toBe(true);
  });

  it("never requires tipoDiagnosticoPrincipal for a procedure (DT1 v003 defines no such field for procedimientos)", () => {
    const result = getEncounterRipsReadiness(
      baseEncounter({
        diagnoses: [principalDiag({ diagnosisTypeCode: null })],
        services: [baseService({ ripsServiceType: "procedure", cupsCode: "230100", serviceValue: 0 })],
      }),
    );
    expect(result.errors.map((e) => e.code)).not.toContain("CONSULTATION_DIAGNOSIS_TYPE_MISSING");
  });

  it("does not pile on a redundant diagnosis-type error when the principal itself is missing", () => {
    const result = getEncounterRipsReadiness(baseEncounter({ diagnoses: [] }));
    expect(result.errors.map((e) => e.code)).not.toContain("CONSULTATION_DIAGNOSIS_TYPE_MISSING");
    expect(result.errors.map((e) => e.code)).toContain("ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING");
  });
});

function readyPatient(overrides: Partial<ExportReadinessPatient> = {}): ExportReadinessPatient {
  return {
    patientId: "patient-1",
    patientName: "Laura Gómez",
    documentType: "CC",
    documentNumber: "123456",
    birthDate: "1990-01-01",
    sexCode: "F",
    userTypeCode: "05",
    countryOfResidenceCode: "170",
    municipalityOfResidenceCode: "11001",
    residenceZoneCode: "01",
    ...overrides,
  };
}

describe("getRipsExportReadiness", () => {
  const readyLocation = { id: "loc-1", name: "Sede Centro", codPrestador: "110010123401" };

  it("is ready when clinic, exactly one location, patients, and encounters are all complete", () => {
    const result = getRipsExportReadiness({
      clinicTaxId: "900123456",
      locations: [readyLocation],
      patients: [readyPatient()],
      encounters: [baseEncounter()],
    });
    expect(result).toEqual({ ready: true, errors: [] });
  });

  it("flags a missing clinic tax id", () => {
    const result = getRipsExportReadiness({ clinicTaxId: null, locations: [readyLocation], patients: [], encounters: [] });
    expect(result.errors.map((e) => e.code)).toContain("CLINIC_TAX_ID_MISSING");
  });

  it("flags a missing codPrestador when there is exactly one location", () => {
    const result = getRipsExportReadiness({
      clinicTaxId: "900123456",
      locations: [{ ...readyLocation, codPrestador: null }],
      patients: [],
      encounters: [],
    });
    expect(result.errors.map((e) => e.code)).toContain("LOCATION_COD_PRESTADOR_MISSING");
  });

  // Regression coverage for "PROMPT NINJA — Mejorar selector de período
  // RIPS y mantener UI completamente en español": user-facing readiness
  // copy must never leak DT1's own internal field names, and must never
  // double a sede's own name (e.g. "Sede Sede principal").
  it("never exposes the internal 'codPrestador' field name in the location message", () => {
    const result = getRipsExportReadiness({
      clinicTaxId: "900123456",
      locations: [{ ...readyLocation, codPrestador: null }],
      patients: [],
      encounters: [],
    });
    const error = result.errors.find((e) => e.code === "LOCATION_COD_PRESTADOR_MISSING");
    expect(error?.message).not.toContain("codPrestador");
    expect(error?.message).toContain("código de habilitación (REPS)");
  });

  it("never doubles the sede's own name when it's literally called 'Sede principal'", () => {
    const result = getRipsExportReadiness({
      clinicTaxId: "900123456",
      locations: [{ id: "loc-1", name: "Sede principal", codPrestador: null }],
      patients: [],
      encounters: [],
    });
    const error = result.errors.find((e) => e.code === "LOCATION_COD_PRESTADOR_MISSING");
    expect(error?.message).not.toContain("Sede Sede principal");
    expect(error?.message).toBe("Sede principal — falta el código de habilitación (REPS).");
  });

  it("never exposes the internal 'numDocumentoIdObligado' field name in the clinic tax id message", () => {
    const result = getRipsExportReadiness({ clinicTaxId: null, locations: [readyLocation], patients: [], encounters: [] });
    const error = result.errors.find((e) => e.code === "CLINIC_TAX_ID_MISSING");
    expect(error?.message).not.toContain("numDocumentoIdObligado");
  });

  // Regression coverage for "PROMPT NINJA — Crear bloque dedicado
  // Configuración RIPS en Clínica": clinic/location blockers must land the
  // user directly on the new anchored block, never a bare /clinica the
  // fix is buried somewhere inside.
  it.each(["CLINIC_TAX_ID_MISSING", "LOCATION_MISSING", "LOCATION_COD_PRESTADOR_MISSING"] as const)(
    "%s points Corregir at the Configuración RIPS anchor, not a bare /clinica",
    (code) => {
      const inputsByCode: Record<typeof code, Parameters<typeof getRipsExportReadiness>[0]> = {
        CLINIC_TAX_ID_MISSING: { clinicTaxId: null, locations: [readyLocation], patients: [], encounters: [] },
        LOCATION_MISSING: { clinicTaxId: "900123456", locations: [], patients: [], encounters: [] },
        LOCATION_COD_PRESTADOR_MISSING: {
          clinicTaxId: "900123456",
          locations: [{ ...readyLocation, codPrestador: null }],
          patients: [],
          encounters: [],
        },
      };
      const result = getRipsExportReadiness(inputsByCode[code]);
      const error = result.errors.find((e) => e.code === code);
      expect(error?.fixHref).toBe("/clinica#rips");
    },
  );

  it("flags ambiguity — never silently picks the primary — when more than one location exists, with no fix screen to link to", () => {
    const result = getRipsExportReadiness({
      clinicTaxId: "900123456",
      locations: [readyLocation, { id: "loc-2", name: "Sede Norte", codPrestador: "110010123402" }],
      patients: [],
      encounters: [],
    });
    const error = result.errors.find((e) => e.code === "LOCATION_AMBIGUOUS");
    expect(error).toBeDefined();
    expect(error?.fixHref).toBeNull();
  });

  it("flags a clinic with zero locations", () => {
    const result = getRipsExportReadiness({ clinicTaxId: "900123456", locations: [], patients: [], encounters: [] });
    expect(result.errors.map((e) => e.code)).toContain("LOCATION_MISSING");
  });

  it("never touches a patient blocker's own fixHref (/pacientes)", () => {
    const result = getRipsExportReadiness({
      clinicTaxId: "900123456",
      locations: [readyLocation],
      patients: [readyPatient({ documentType: null })],
      encounters: [],
    });
    const error = result.errors.find((e) => e.code === "PATIENT_DOCUMENT_TYPE_MISSING");
    expect(error?.fixHref).toBe("/pacientes");
  });

  it.each([
    ["documentType", "PATIENT_DOCUMENT_TYPE_MISSING"],
    ["documentNumber", "PATIENT_DOCUMENT_NUMBER_MISSING"],
    ["birthDate", "PATIENT_BIRTH_DATE_MISSING"],
    ["sexCode", "PATIENT_SEX_MISSING"],
    ["userTypeCode", "PATIENT_USER_TYPE_MISSING"],
    ["countryOfResidenceCode", "PATIENT_COUNTRY_RESIDENCE_MISSING"],
  ] as const)("flags a missing patient.%s", (field, code) => {
    const result = getRipsExportReadiness({
      clinicTaxId: "900123456",
      locations: [readyLocation],
      patients: [readyPatient({ [field]: null })],
      encounters: [],
    });
    expect(result.errors.map((e) => e.code)).toContain(code);
  });

  it("requires municipality/zone only when residing in Colombia (170)", () => {
    const foreignResident = readyPatient({ countryOfResidenceCode: "840", municipalityOfResidenceCode: null, residenceZoneCode: null });
    const result = getRipsExportReadiness({ clinicTaxId: "900123456", locations: [readyLocation], patients: [foreignResident], encounters: [] });
    expect(result.errors.map((e) => e.code)).not.toContain("PATIENT_MUNICIPALITY_MISSING");
    expect(result.errors.map((e) => e.code)).not.toContain("PATIENT_ZONE_MISSING");
  });

  it("flags missing municipality/zone for a Colombian resident who lacks them", () => {
    const result = getRipsExportReadiness({
      clinicTaxId: "900123456",
      locations: [readyLocation],
      patients: [readyPatient({ municipalityOfResidenceCode: null, residenceZoneCode: null })],
      encounters: [],
    });
    expect(result.errors.map((e) => e.code)).toEqual(expect.arrayContaining(["PATIENT_MUNICIPALITY_MISSING", "PATIENT_ZONE_MISSING"]));
  });

  it("aggregates encounter-level errors into the export-level result", () => {
    const result = getRipsExportReadiness({
      clinicTaxId: "900123456",
      locations: [readyLocation],
      patients: [readyPatient()],
      encounters: [baseEncounter({ services: [] })],
    });
    expect(result.errors.map((e) => e.code)).toContain("ENCOUNTER_SERVICE_MISSING");
  });

  it("is ready with zero eligible encounters (an empty period is not itself a blocker at the readiness level)", () => {
    const result = getRipsExportReadiness({ clinicTaxId: "900123456", locations: [readyLocation], patients: [], encounters: [] });
    expect(result.ready).toBe(true);
  });
});
