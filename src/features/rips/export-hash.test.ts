import { describe, expect, it } from "vitest";
import { computeRipsExportContentHash } from "./export-hash";
import {
  buildRipsSinFacturaTransaction,
  serializeRipsSinFacturaTransaction,
  type GeneratorEncounter,
  type GeneratorPatient,
  type GeneratorProfessional,
  type RipsExportGenerationInput,
} from "./export-generator";

// RIPS #5B — Section 18's own explicit test requirement: same content →
// same hash, one byte different → different hash, and the hash is
// computed from the SAME serialized string a caller downloads (never a
// re-stringified copy).

const HEX64 = /^[0-9a-f]{64}$/;

function buildFixtureInput(overrides?: Partial<{ serviceValue: number }>): RipsExportGenerationInput {
  const patient: GeneratorPatient = {
    patientId: "patient-1",
    documentType: "CC",
    documentNumber: "1020304050",
    birthDate: "1990-01-01",
    sexCode: "F",
    userTypeCode: "12",
    countryOfResidenceCode: "170",
    municipalityOfResidenceCode: "05001",
    residenceZoneCode: "02",
    countryOfOriginCode: "170",
  };
  const professional: GeneratorProfessional = {
    professionalProfileId: "prof-1",
    documentType: "CC",
    documentNumber: "900900900",
  };
  const encounter: GeneratorEncounter = {
    encounterId: "enc-1",
    patientId: "patient-1",
    incapacityCode: "NO",
    diagnoses: [
      { cie10Code: "K021", role: "principal", diagnosisTypeCode: "02", encounterServiceId: null, sequence: 0 },
    ],
    services: [
      {
        id: "svc-1",
        cupsCode: "890201",
        ripsServiceType: "consultation",
        performedAtUtc: "2026-07-10T14:00:00.000Z",
        serviceValue: overrides?.serviceValue ?? 100000,
        viaIngresoCode: null,
        modalidadCode: "01",
        grupoServiciosCode: "01",
        codServicioCode: "130",
        finalidadCode: "16",
        causaMotivoCode: "38",
        conceptoRecaudoCode: "05",
        valorPagoModerador: 0,
        sequence: 1,
        professionalProfileId: "prof-1",
      },
    ],
  };

  return {
    numDocumentoIdObligado: "900123456",
    location: { codPrestador: "192030405001", timezone: "America/Bogota" },
    encounters: [encounter],
    patientsById: new Map([["patient-1", patient]]),
    professionalsById: new Map([["prof-1", professional]]),
  };
}

describe("computeRipsExportContentHash", () => {
  it("is a 64-character lowercase hex string", () => {
    expect(computeRipsExportContentHash("{}")).toMatch(HEX64);
  });

  it("returns the same hash for the same content", () => {
    const { transaction } = buildRipsSinFacturaTransaction(buildFixtureInput());
    const json = serializeRipsSinFacturaTransaction(transaction);
    expect(computeRipsExportContentHash(json)).toBe(computeRipsExportContentHash(json));
  });

  it("returns a different hash when a single field changes", () => {
    const { transaction: a } = buildRipsSinFacturaTransaction(buildFixtureInput({ serviceValue: 100000 }));
    const { transaction: b } = buildRipsSinFacturaTransaction(buildFixtureInput({ serviceValue: 100001 }));
    const hashA = computeRipsExportContentHash(serializeRipsSinFacturaTransaction(a));
    const hashB = computeRipsExportContentHash(serializeRipsSinFacturaTransaction(b));
    expect(hashA).not.toBe(hashB);
  });

  it("hashes the exact serialized string, not a re-stringified copy", () => {
    const { transaction } = buildRipsSinFacturaTransaction(buildFixtureInput());
    const json = serializeRipsSinFacturaTransaction(transaction);
    // A re-parsed/re-stringified copy with different spacing must NOT be
    // assumed equivalent — this pins the contract that callers hash the
    // literal string they download, never JSON.stringify(JSON.parse(json)).
    const respacedJson = JSON.stringify(JSON.parse(json));
    expect(computeRipsExportContentHash(json)).not.toBe(computeRipsExportContentHash(respacedJson));
  });
});
