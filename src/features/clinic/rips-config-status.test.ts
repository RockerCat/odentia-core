import { describe, expect, it } from "vitest";
import { getRipsClinicConfigStatus } from "./rips-config-status";

// Regression coverage for "PROMPT NINJA — Crear bloque dedicado
// Configuración RIPS en Clínica": the new /clinica block must reuse the
// real RIPS readiness rules, never a parallel implementation that could
// disagree with /rips.
describe("getRipsClinicConfigStatus", () => {
  it("is incomplete when the location has no codPrestador", () => {
    const status = getRipsClinicConfigStatus({
      clinicTaxId: "900123456",
      location: { id: "loc-1", name: "Sede principal", codPrestador: null },
    });
    expect(status.ready).toBe(false);
    expect(status.errors.map((e) => e.code)).toContain("LOCATION_COD_PRESTADOR_MISSING");
  });

  it("is incomplete when the clinic has no tax id, even if codPrestador is set", () => {
    const status = getRipsClinicConfigStatus({
      clinicTaxId: null,
      location: { id: "loc-1", name: "Sede principal", codPrestador: "110010123401" },
    });
    expect(status.ready).toBe(false);
    expect(status.errors.map((e) => e.code)).toContain("CLINIC_TAX_ID_MISSING");
  });

  it("is incomplete when there is no location at all", () => {
    const status = getRipsClinicConfigStatus({ clinicTaxId: "900123456", location: null });
    expect(status.ready).toBe(false);
    expect(status.errors.map((e) => e.code)).toContain("LOCATION_MISSING");
  });

  it("is ready when both tax id and codPrestador are present — never 'ready' just because a field is non-empty", () => {
    const status = getRipsClinicConfigStatus({
      clinicTaxId: "900123456",
      location: { id: "loc-1", name: "Sede principal", codPrestador: "110010123401" },
    });
    expect(status.ready).toBe(true);
    expect(status.errors).toEqual([]);
  });
});
