import { describe, expect, it } from "vitest";
import {
  buildRipsSinFacturaTransaction,
  getRipsExportFilename,
  resolveDiagnosesForService,
  serializeRipsSinFacturaTransaction,
  type GeneratorDiagnosis,
  type GeneratorEncounter,
  type GeneratorPatient,
  type GeneratorProfessional,
  type RipsExportGenerationInput,
} from "./export-generator";

describe("resolveDiagnosesForService", () => {
  const wide = (overrides: Partial<GeneratorDiagnosis>): GeneratorDiagnosis => ({
    cie10Code: "K021",
    role: "principal",
    diagnosisTypeCode: null,
    encounterServiceId: null,
    sequence: 0,
    ...overrides,
  });

  it("falls back to the encounter-wide principal when no service-scoped one exists", () => {
    const diagnoses = [wide({ role: "principal", cie10Code: "K021" })];
    const result = resolveDiagnosesForService(diagnoses, "svc-1");
    expect(result.principal?.cie10Code).toBe("K021");
  });

  it("prefers a service-scoped principal over the encounter-wide one", () => {
    const diagnoses = [
      wide({ role: "principal", cie10Code: "K021", encounterServiceId: null }),
      wide({ role: "principal", cie10Code: "K046", encounterServiceId: "svc-2" }),
    ];
    const result = resolveDiagnosesForService(diagnoses, "svc-2");
    expect(result.principal?.cie10Code).toBe("K046");
  });

  it("unions encounter-wide and service-scoped related diagnoses, deduplicated and ordered by sequence", () => {
    const diagnoses = [
      wide({ role: "principal", cie10Code: "K021" }),
      wide({ role: "related", cie10Code: "K025", sequence: 2 }),
      wide({ role: "related", cie10Code: "K046", sequence: 1, encounterServiceId: "svc-1" }),
      wide({ role: "related", cie10Code: "K025", sequence: 3, encounterServiceId: "svc-1" }), // duplicate code, different scope
    ];
    const result = resolveDiagnosesForService(diagnoses, "svc-1");
    expect(result.related.map((d) => d.cie10Code)).toEqual(["K046", "K025"]);
  });

  it("returns no principal when neither scope has one", () => {
    const result = resolveDiagnosesForService([], "svc-1");
    expect(result.principal).toBeNull();
  });
});

function diag(overrides: Partial<GeneratorDiagnosis>): GeneratorDiagnosis {
  return { cie10Code: "K021", role: "principal", diagnosisTypeCode: null, encounterServiceId: null, sequence: 0, ...overrides };
}

// -----------------------------------------------------------------------
// Golden fixture — no real PII, mirrors a small dental clinic's July 2026:
// - Patient A: two encounters sharing the same incapacityCode ("02") →
//   ONE usuario entry with both a consulta and a procedimiento.
// - Patient B: one encounter with a consulta AND a procedimiento sharing a
//   single encounter-wide diagnosis set, deliberately carrying 4 related
//   diagnoses to exercise truncation (3 slots for consulta, 1 for
//   procedimiento) — see this task's own Section 12/31.
// -----------------------------------------------------------------------
function buildFixtureInput(): RipsExportGenerationInput {
  const patientA: GeneratorPatient = {
    patientId: "patient-a",
    documentType: "CC",
    documentNumber: "1010101010",
    birthDate: "1990-05-01",
    sexCode: "F",
    userTypeCode: "05",
    countryOfResidenceCode: "170",
    municipalityOfResidenceCode: "11001",
    residenceZoneCode: "01",
    countryOfOriginCode: "170",
  };
  const patientB: GeneratorPatient = {
    patientId: "patient-b",
    documentType: "CC",
    documentNumber: "1020202020",
    birthDate: "1985-03-15",
    sexCode: "M",
    userTypeCode: "05",
    countryOfResidenceCode: "170",
    municipalityOfResidenceCode: "11001",
    residenceZoneCode: "01",
    countryOfOriginCode: "170",
  };
  const professional: GeneratorProfessional = { professionalProfileId: "prof-1", documentType: "CC", documentNumber: "80100200" };

  const enc1: GeneratorEncounter = {
    encounterId: "enc-1",
    patientId: "patient-a",
    incapacityCode: "02",
    diagnoses: [
      diag({ cie10Code: "K021", role: "principal", diagnosisTypeCode: "01", sequence: 0 }),
      diag({ cie10Code: "K025", role: "related", sequence: 1 }),
    ],
    services: [
      {
        id: "svc-1",
        cupsCode: "890201",
        ripsServiceType: "consultation",
        performedAtUtc: "2026-07-05T13:00:00.000Z",
        serviceValue: 50000,
        viaIngresoCode: null,
        modalidadCode: "09",
        grupoServiciosCode: "01",
        codServicioCode: "01",
        finalidadCode: "11",
        causaMotivoCode: "21",
        conceptoRecaudoCode: "02",
        valorPagoModerador: 5000,
        sequence: 0,
        professionalProfileId: "prof-1",
      },
    ],
  };

  const enc2: GeneratorEncounter = {
    encounterId: "enc-2",
    patientId: "patient-a",
    incapacityCode: "02",
    diagnoses: [diag({ cie10Code: "K046", role: "principal", diagnosisTypeCode: null, encounterServiceId: "svc-2", sequence: 0 })],
    services: [
      {
        id: "svc-2",
        cupsCode: "230100",
        ripsServiceType: "procedure",
        performedAtUtc: "2026-07-10T14:00:00.000Z",
        serviceValue: 0,
        viaIngresoCode: "02",
        modalidadCode: "09",
        grupoServiciosCode: "02",
        codServicioCode: "02",
        finalidadCode: null,
        causaMotivoCode: null,
        conceptoRecaudoCode: null,
        valorPagoModerador: null,
        sequence: 0,
        professionalProfileId: "prof-1",
      },
    ],
  };

  const enc3: GeneratorEncounter = {
    encounterId: "enc-3",
    patientId: "patient-b",
    incapacityCode: "01",
    diagnoses: [
      diag({ cie10Code: "K021", role: "principal", diagnosisTypeCode: "01", sequence: 0 }),
      diag({ cie10Code: "K025", role: "related", sequence: 1 }),
      diag({ cie10Code: "K046", role: "related", sequence: 2 }),
      diag({ cie10Code: "K048", role: "related", sequence: 3 }),
      diag({ cie10Code: "K029", role: "related", sequence: 4 }),
    ],
    services: [
      {
        id: "svc-3",
        cupsCode: "890201",
        ripsServiceType: "consultation",
        performedAtUtc: "2026-07-15T15:30:00.000Z",
        serviceValue: 60000,
        viaIngresoCode: null,
        modalidadCode: "09",
        grupoServiciosCode: "01",
        codServicioCode: "01",
        finalidadCode: "11",
        causaMotivoCode: "21",
        conceptoRecaudoCode: "02",
        valorPagoModerador: 0,
        sequence: 0,
        professionalProfileId: "prof-1",
      },
      {
        id: "svc-4",
        cupsCode: "230100",
        ripsServiceType: "procedure",
        performedAtUtc: "2026-07-15T16:00:00.000Z",
        serviceValue: 0,
        viaIngresoCode: "02",
        modalidadCode: "09",
        grupoServiciosCode: "02",
        codServicioCode: "02",
        finalidadCode: null,
        causaMotivoCode: null,
        conceptoRecaudoCode: null,
        valorPagoModerador: null,
        sequence: 1,
        professionalProfileId: "prof-1",
      },
    ],
  };

  return {
    numDocumentoIdObligado: "900123456",
    location: { codPrestador: "110010123401", timezone: "America/Bogota" },
    encounters: [enc1, enc2, enc3],
    patientsById: new Map([
      ["patient-a", patientA],
      ["patient-b", patientB],
    ]),
    professionalsById: new Map([["prof-1", professional]]),
  };
}

describe("buildRipsSinFacturaTransaction — golden fixture", () => {
  it("produces the exact expected transaction shape", () => {
    const { transaction, warnings } = buildRipsSinFacturaTransaction(buildFixtureInput());

    expect(transaction).toEqual({
      numDocumentoIdObligado: "900123456",
      numFactura: null,
      tipoNota: null,
      numNota: null,
      usuarios: [
        {
          tipoDocumentoIdentificacion: "CC",
          numDocumentoIdentificacion: "1010101010",
          tipoUsuario: "05",
          fechaNacimiento: "1990-05-01",
          codSexo: "F",
          codPaisResidencia: "170",
          codMunicipioResidencia: "11001",
          codZonaTerritorialResidencia: "01",
          incapacidad: "02",
          consecutivo: 1,
          codPaisOrigen: "170",
          registroSIRAS: null,
          servicios: {
            consultas: [
              {
                codPrestador: "110010123401",
                fechaInicioAtencion: "2026-07-05 08:00",
                numAutorizacion: null,
                codConsulta: "890201",
                modalidadGrupoServicioTecSal: "09",
                grupoServicios: "01",
                codServicio: "01",
                finalidadTecnologiaSalud: "11",
                causaMotivoAtencion: "21",
                codDiagnosticoPrincipal: "K021",
                codDiagnosticoPrincipalCIE11: null,
                nomCodDiagnosticoPrincipalCIE11: null,
                codDiagnosticoRelacionado1: "K025",
                codDiagnosticoRelacionado1CIE11: null,
                nomCodDiagnosticoRelacionado1CIE11: null,
                codDiagnosticoRelacionado2: null,
                codDiagnosticoRelacionado2CIE11: null,
                nomCodDiagnosticoRelacionado2CIE11: null,
                codDiagnosticoRelacionado3: null,
                codDiagnosticoRelacionado3CIE11: null,
                nomCodDiagnosticoRelacionado3CIE11: null,
                tipoDiagnosticoPrincipal: "01",
                tipoDocumentoIdentificacion: "CC",
                numDocumentoIdentificacion: "80100200",
                vrServicio: 50000,
                conceptoRecaudo: "02",
                valorPagoModerador: 5000,
                numFEVPagoModerador: null,
                consecutivo: 1,
                codigoVIDA: null,
              },
            ],
            procedimientos: [
              {
                codPrestador: "110010123401",
                fechaInicioAtencion: "2026-07-10 09:00",
                idMIPRES: null,
                numAutorizacion: null,
                codProcedimiento: "230100",
                viaIngresoServicioSalud: "02",
                modalidadGrupoServicioTecSal: "09",
                grupoServicios: "02",
                codServicio: "02",
                finalidadTecnologiaSalud: null,
                tipoDocumentoIdentificacion: "CC",
                numDocumentoIdentificacion: "80100200",
                codDiagnosticoPrincipal: "K046",
                codDiagnosticoPrincipalCIE11: null,
                nomCodDiagnosticoPrincipalCIE11: null,
                codDiagnosticoRelacionado: null,
                codDiagnosticoRelacionadoCIE11: null,
                nomCodDiagnosticoRelacionadoCIE11: null,
                codComplicacion: null,
                vrServicio: 0,
                conceptoRecaudo: null,
                valorPagoModerador: 0,
                numFEVPagoModerador: null,
                consecutivo: 1,
                codigoVIDA: null,
              },
            ],
          },
        },
        {
          tipoDocumentoIdentificacion: "CC",
          numDocumentoIdentificacion: "1020202020",
          tipoUsuario: "05",
          fechaNacimiento: "1985-03-15",
          codSexo: "M",
          codPaisResidencia: "170",
          codMunicipioResidencia: "11001",
          codZonaTerritorialResidencia: "01",
          incapacidad: "01",
          consecutivo: 2,
          codPaisOrigen: "170",
          registroSIRAS: null,
          servicios: {
            consultas: [
              {
                codPrestador: "110010123401",
                fechaInicioAtencion: "2026-07-15 10:30",
                numAutorizacion: null,
                codConsulta: "890201",
                modalidadGrupoServicioTecSal: "09",
                grupoServicios: "01",
                codServicio: "01",
                finalidadTecnologiaSalud: "11",
                causaMotivoAtencion: "21",
                codDiagnosticoPrincipal: "K021",
                codDiagnosticoPrincipalCIE11: null,
                nomCodDiagnosticoPrincipalCIE11: null,
                codDiagnosticoRelacionado1: "K025",
                codDiagnosticoRelacionado1CIE11: null,
                nomCodDiagnosticoRelacionado1CIE11: null,
                codDiagnosticoRelacionado2: "K046",
                codDiagnosticoRelacionado2CIE11: null,
                nomCodDiagnosticoRelacionado2CIE11: null,
                codDiagnosticoRelacionado3: "K048",
                codDiagnosticoRelacionado3CIE11: null,
                nomCodDiagnosticoRelacionado3CIE11: null,
                tipoDiagnosticoPrincipal: "01",
                tipoDocumentoIdentificacion: "CC",
                numDocumentoIdentificacion: "80100200",
                vrServicio: 60000,
                conceptoRecaudo: "02",
                valorPagoModerador: 0,
                numFEVPagoModerador: null,
                consecutivo: 1,
                codigoVIDA: null,
              },
            ],
            procedimientos: [
              {
                codPrestador: "110010123401",
                fechaInicioAtencion: "2026-07-15 11:00",
                idMIPRES: null,
                numAutorizacion: null,
                codProcedimiento: "230100",
                viaIngresoServicioSalud: "02",
                modalidadGrupoServicioTecSal: "09",
                grupoServicios: "02",
                codServicio: "02",
                finalidadTecnologiaSalud: null,
                tipoDocumentoIdentificacion: "CC",
                numDocumentoIdentificacion: "80100200",
                codDiagnosticoPrincipal: "K021",
                codDiagnosticoPrincipalCIE11: null,
                nomCodDiagnosticoPrincipalCIE11: null,
                codDiagnosticoRelacionado: "K025",
                codDiagnosticoRelacionadoCIE11: null,
                nomCodDiagnosticoRelacionadoCIE11: null,
                codComplicacion: null,
                vrServicio: 0,
                conceptoRecaudo: null,
                valorPagoModerador: 0,
                numFEVPagoModerador: null,
                consecutivo: 1,
                codigoVIDA: null,
              },
            ],
          },
        },
      ],
    });

    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.serviceId)).toEqual(["svc-3", "svc-4"]);
    expect(warnings.every((w) => w.code === "RELATED_DIAGNOSES_TRUNCATED" && w.encounterId === "enc-3")).toBe(true);
  });

  it("is deterministic — same input twice produces byte-identical JSON", () => {
    const input = buildFixtureInput();
    const first = serializeRipsSinFacturaTransaction(buildRipsSinFacturaTransaction(input).transaction);
    const second = serializeRipsSinFacturaTransaction(buildRipsSinFacturaTransaction(input).transaction);
    expect(first).toBe(second);
  });

  it("is order-independent — shuffling the input encounters/services never changes the output", () => {
    const input = buildFixtureInput();
    const shuffled: RipsExportGenerationInput = { ...input, encounters: [...input.encounters].reverse() };
    const original = serializeRipsSinFacturaTransaction(buildRipsSinFacturaTransaction(input).transaction);
    const reordered = serializeRipsSinFacturaTransaction(buildRipsSinFacturaTransaction(shuffled).transaction);
    expect(reordered).toBe(original);
  });

  it("coerces a stray numeric string (a defensive edge case, not the normal Supabase shape) without corrupting the value", () => {
    const input = buildFixtureInput();
    // @ts-expect-error deliberately feeding a string to prove toMoneyNumber's coercion path
    input.encounters[0]!.services[0]!.serviceValue = "50000";
    const { transaction } = buildRipsSinFacturaTransaction(input);
    expect(transaction.usuarios[0]?.servicios.consultas?.[0]?.vrServicio).toBe(50000);
  });

  it("never emits valorPagoModerador as null — always a number, per DT1 v003's own 'informar cero (0)' rule", () => {
    const { transaction } = buildRipsSinFacturaTransaction(buildFixtureInput());
    for (const usuario of transaction.usuarios) {
      for (const consulta of usuario.servicios.consultas ?? []) expect(typeof consulta.valorPagoModerador).toBe("number");
      for (const procedimiento of usuario.servicios.procedimientos ?? []) expect(typeof procedimiento.valorPagoModerador).toBe("number");
    }
  });

  it("omits the procedimientos array entirely for a usuario with only consultas (never an empty array)", () => {
    const input = buildFixtureInput();
    const onlyConsultation: RipsExportGenerationInput = {
      ...input,
      encounters: [input.encounters[0]!], // enc-1 only — a single consultation, no procedure
    };
    const { transaction } = buildRipsSinFacturaTransaction(onlyConsultation);
    expect(transaction.usuarios).toHaveLength(1);
    expect(transaction.usuarios[0]?.servicios.procedimientos).toBeUndefined();
    expect(transaction.usuarios[0]?.servicios.consultas).toHaveLength(1);
  });
});

describe("buildRipsSinFacturaTransaction — tipoDiagnosticoPrincipal (C14)", () => {
  it("never emits tipoDiagnosticoPrincipal as \"\" — throws instead when a consultation's principal has no diagnosisTypeCode", () => {
    const input = buildFixtureInput();
    input.encounters[0]!.diagnoses[0]!.diagnosisTypeCode = null; // enc-1's principal, feeding svc-1 (a consultation)
    expect(() => buildRipsSinFacturaTransaction(input)).toThrow(/diagnosisTypeCode/);
  });

  it("carries the real diagnosisTypeCode through untouched when present", () => {
    const { transaction } = buildRipsSinFacturaTransaction(buildFixtureInput());
    expect(transaction.usuarios[0]?.servicios.consultas?.[0]?.tipoDiagnosticoPrincipal).toBe("01");
  });
});

describe("getRipsExportFilename", () => {
  it("formats as RIPS_Sin_Factura_YYYY-MM.json with a zero-padded month", () => {
    expect(getRipsExportFilename({ year: 2026, month: 7 })).toBe("RIPS_Sin_Factura_2026-07.json");
    expect(getRipsExportFilename({ year: 2026, month: 11 })).toBe("RIPS_Sin_Factura_2026-11.json");
  });
});
