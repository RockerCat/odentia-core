import { describe, expect, it } from "vitest";
import { buildRipsSinFacturaTransaction, type RipsExportGenerationInput } from "./export-generator";
import { validateRipsSinFacturaTransaction } from "./export-schema";
import type { RipsSinFacturaTransaction } from "./export-types";

// A minimal, already-valid transaction (hand-built, not via the
// generator) — the baseline every mutation test below starts from and
// then breaks exactly one field at a time.
function validTransaction(): RipsSinFacturaTransaction {
  return {
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
    ],
  };
}

describe("validateRipsSinFacturaTransaction — valid input", () => {
  it("accepts a well-formed transaction", () => {
    expect(validateRipsSinFacturaTransaction(validTransaction())).toEqual({ valid: true, errors: [] });
  });

  it("accepts the actual output of buildRipsSinFacturaTransaction (golden fixture)", () => {
    const input: RipsExportGenerationInput = {
      numDocumentoIdObligado: "900123456",
      location: { codPrestador: "110010123401", timezone: "America/Bogota" },
      encounters: [
        {
          encounterId: "enc-1",
          patientId: "patient-a",
          incapacityCode: "02",
          diagnoses: [
            { cie10Code: "K021", role: "principal", diagnosisTypeCode: "01", encounterServiceId: null, sequence: 0 },
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
        },
      ],
      patientsById: new Map([
        [
          "patient-a",
          {
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
          },
        ],
      ]),
      professionalsById: new Map([["prof-1", { professionalProfileId: "prof-1", documentType: "CC", documentNumber: "80100200" }]]),
    };
    const { transaction } = buildRipsSinFacturaTransaction(input);
    expect(validateRipsSinFacturaTransaction(transaction)).toEqual({ valid: true, errors: [] });
  });
});

describe("validateRipsSinFacturaTransaction — rejects malformed input", () => {
  it("rejects a non-object root", () => {
    const result = validateRipsSinFacturaTransaction("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejects an empty usuarios array", () => {
    const t = validTransaction();
    t.usuarios = [];
    expect(validateRipsSinFacturaTransaction(t).valid).toBe(false);
  });

  it("rejects numFactura when it isn't null (RIPS sin factura must never set it)", () => {
    const t = validTransaction() as unknown as Record<string, unknown>;
    t.numFactura = "Fac001";
    const result = validateRipsSinFacturaTransaction(t);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "$.numFactura")).toBe(true);
  });

  it("rejects a numDocumentoIdObligado that is too short", () => {
    const t = validTransaction();
    t.numDocumentoIdObligado = "12";
    expect(validateRipsSinFacturaTransaction(t).valid).toBe(false);
  });

  it("rejects a consulta missing codDiagnosticoPrincipal", () => {
    const t = validTransaction() as unknown as { usuarios: [{ servicios: { consultas: [Record<string, unknown>] } }] };
    t.usuarios[0].servicios.consultas[0].codDiagnosticoPrincipal = null;
    const result = validateRipsSinFacturaTransaction(t);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith("codDiagnosticoPrincipal"))).toBe(true);
  });

  it("rejects a consulta with an empty-string tipoDiagnosticoPrincipal (never a null-substitute)", () => {
    const t = validTransaction() as unknown as { usuarios: [{ servicios: { consultas: [Record<string, unknown>] } }] };
    t.usuarios[0].servicios.consultas[0].tipoDiagnosticoPrincipal = "";
    const result = validateRipsSinFacturaTransaction(t);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith("tipoDiagnosticoPrincipal"))).toBe(true);
  });

  it("rejects a negative vrServicio", () => {
    const t = validTransaction() as unknown as { usuarios: [{ servicios: { consultas: [Record<string, unknown>] } }] };
    t.usuarios[0].servicios.consultas[0].vrServicio = -100;
    expect(validateRipsSinFacturaTransaction(t).valid).toBe(false);
  });

  it("rejects a null valorPagoModerador (DT1 v003 requires 0, never null)", () => {
    const t = validTransaction() as unknown as { usuarios: [{ servicios: { consultas: [Record<string, unknown>] } }] };
    t.usuarios[0].servicios.consultas[0].valorPagoModerador = null;
    expect(validateRipsSinFacturaTransaction(t).valid).toBe(false);
  });

  it("rejects a procedimiento whose vrServicio isn't exactly 0 (RIPS sin factura invariant)", () => {
    const t = validTransaction() as unknown as { usuarios: [{ servicios: { procedimientos: [Record<string, unknown>] } }] };
    t.usuarios[0].servicios.procedimientos[0].vrServicio = 15000;
    const result = validateRipsSinFacturaTransaction(t);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.endsWith("vrServicio"))).toBe(true);
  });

  it("rejects a non-integer consecutivo", () => {
    const t = validTransaction();
    t.usuarios[0].consecutivo = 1.5;
    expect(validateRipsSinFacturaTransaction(t).valid).toBe(false);
  });

  it("rejects a malformed fechaInicioAtencion (must be YYYY-MM-DD HH:MM)", () => {
    const t = validTransaction() as unknown as { usuarios: [{ servicios: { consultas: [Record<string, unknown>] } }] };
    t.usuarios[0].servicios.consultas[0].fechaInicioAtencion = "2026-07-05T08:00:00.000Z";
    expect(validateRipsSinFacturaTransaction(t).valid).toBe(false);
  });

  it("rejects a malformed fechaNacimiento", () => {
    const t = validTransaction();
    t.usuarios[0].fechaNacimiento = "05/01/1990";
    expect(validateRipsSinFacturaTransaction(t).valid).toBe(false);
  });

  it("rejects codPaisOrigenCIE11-style leakage — any *CIE11 field that isn't null", () => {
    const t = validTransaction() as unknown as { usuarios: [{ servicios: { consultas: [Record<string, unknown>] } }] };
    t.usuarios[0].servicios.consultas[0].codDiagnosticoPrincipalCIE11 = "1A00";
    expect(validateRipsSinFacturaTransaction(t).valid).toBe(false);
  });

  it("rejects a usuario with neither consultas nor procedimientos", () => {
    const t = validTransaction();
    t.usuarios[0].servicios = {};
    expect(validateRipsSinFacturaTransaction(t).valid).toBe(false);
  });

  it("never includes the actual field value in an error message (PII safety)", () => {
    const t = validTransaction();
    t.usuarios[0].numDocumentoIdentificacion = "SENSITIVE-DOC-NUMBER-999";
    // Corrupt it into failing a real rule (too long) so an error fires...
    t.usuarios[0].numDocumentoIdentificacion = "SENSITIVE-DOC-NUMBER-999-TOO-LONG-TO-BE-VALID";
    const result = validateRipsSinFacturaTransaction(t);
    expect(result.valid).toBe(false);
    for (const error of result.errors) {
      expect(error.message).not.toContain("SENSITIVE-DOC-NUMBER-999");
    }
  });

  it("reports multiple independent errors in one pass rather than stopping at the first", () => {
    const t = validTransaction();
    t.numDocumentoIdObligado = "1";
    t.usuarios[0].codSexo = "";
    const result = validateRipsSinFacturaTransaction(t);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
