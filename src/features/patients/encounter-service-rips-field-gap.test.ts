import { describe, expect, it } from "vitest";
import type { EncounterClinicalData, EncounterServiceRecord } from "./clinical-encounters-data";
import { applyRipsFieldCorrection, hasRipsFieldGap, shouldShowRipsFieldGapIndicator } from "./encounter-service-rips-field-gap";

function service(overrides: Partial<EncounterServiceRecord> = {}): EncounterServiceRecord {
  return {
    id: "svc-1",
    encounterId: "enc-1",
    professionalProfileId: "prof-1",
    cupsCode: "890201",
    ripsServiceType: "consultation",
    performedAt: "2026-07-05T13:00:00.000Z",
    serviceValue: 50000,
    viaIngresoCode: null,
    modalidadCode: "01",
    grupoServiciosCode: null,
    codServicioCode: null,
    finalidadCode: null,
    causaMotivoCode: null,
    conceptoRecaudoCode: null,
    valorPagoModerador: null,
    sequence: 0,
    clinicalConceptId: null,
    clinicalConceptVariantId: null,
    clinicalConceptNameSnapshot: null,
    clinicalVariantNameSnapshot: null,
    mappingStatus: null,
    ...overrides,
  };
}

describe("hasRipsFieldGap", () => {
  it("consultation: Finalidad null -> gap", () => {
    expect(hasRipsFieldGap({ ripsServiceType: "consultation", finalidadCode: null, causaMotivoCode: "21" })).toBe(true);
  });

  it("consultation: Causa null -> gap", () => {
    expect(hasRipsFieldGap({ ripsServiceType: "consultation", finalidadCode: "11", causaMotivoCode: null })).toBe(true);
  });

  it("consultation: both present -> no gap", () => {
    expect(hasRipsFieldGap({ ripsServiceType: "consultation", finalidadCode: "11", causaMotivoCode: "21" })).toBe(false);
  });

  it("procedure: Finalidad null -> gap", () => {
    expect(hasRipsFieldGap({ ripsServiceType: "procedure", finalidadCode: null, causaMotivoCode: null })).toBe(true);
  });

  it("procedure: Finalidad present, Causa null -> NO gap (Causa never applies to a procedure)", () => {
    expect(hasRipsFieldGap({ ripsServiceType: "procedure", finalidadCode: "11", causaMotivoCode: null })).toBe(false);
  });

  it("unknown-classified service: Finalidad null still counts as a gap (Finalidad applies regardless of classification here)", () => {
    expect(hasRipsFieldGap({ ripsServiceType: "unknown", finalidadCode: null, causaMotivoCode: null })).toBe(true);
  });
});

describe("shouldShowRipsFieldGapIndicator", () => {
  const gapService = { ripsServiceType: "consultation" as const, finalidadCode: null, causaMotivoCode: "21" };
  const completeService = { ripsServiceType: "consultation" as const, finalidadCode: "11", causaMotivoCode: "21" };

  it("canEditClinicalData=true + a gap → true", () => {
    expect(shouldShowRipsFieldGapIndicator(true, [gapService])).toBe(true);
  });

  it("canEditClinicalData=true + every service complete → false", () => {
    expect(shouldShowRipsFieldGapIndicator(true, [completeService])).toBe(false);
  });

  it("canEditClinicalData=false + a gap → false (never shown to a role with no clinical write authority)", () => {
    expect(shouldShowRipsFieldGapIndicator(false, [gapService])).toBe(false);
  });

  it("no services at all → false", () => {
    expect(shouldShowRipsFieldGapIndicator(true, [])).toBe(false);
  });
});

describe("applyRipsFieldCorrection", () => {
  function dataMap(services: EncounterServiceRecord[]): Map<string, EncounterClinicalData> {
    return new Map([["enc-1", { diagnoses: [], services }]]);
  }

  it("updates exactly the targeted service's field, leaving other fields on it untouched", () => {
    const before = dataMap([service({ id: "svc-1", finalidadCode: null, causaMotivoCode: null })]);
    const after = applyRipsFieldCorrection(before, "enc-1", "svc-1", "finalidad_code", "11");
    const updated = after.get("enc-1")!.services[0]!;
    expect(updated.finalidadCode).toBe("11");
    expect(updated.causaMotivoCode).toBeNull();
  });

  it("a remaining gap on the SAME service (the other field) stays visible after one correction", () => {
    const before = dataMap([service({ id: "svc-1", finalidadCode: null, causaMotivoCode: null })]);
    const afterFinalidad = applyRipsFieldCorrection(before, "enc-1", "svc-1", "finalidad_code", "11");
    expect(hasRipsFieldGap(afterFinalidad.get("enc-1")!.services[0]!)).toBe(true); // causaMotivoCode still null
    const afterBoth = applyRipsFieldCorrection(afterFinalidad, "enc-1", "svc-1", "causa_motivo_code", "21");
    expect(hasRipsFieldGap(afterBoth.get("enc-1")!.services[0]!)).toBe(false);
  });

  it("a gap on a DIFFERENT service in the same encounter is never touched by another service's correction", () => {
    const before = dataMap([
      service({ id: "svc-1", finalidadCode: null }),
      service({ id: "svc-2", cupsCode: "997001", ripsServiceType: "procedure", finalidadCode: null, causaMotivoCode: null }),
    ]);
    const after = applyRipsFieldCorrection(before, "enc-1", "svc-1", "finalidad_code", "11");
    expect(after.get("enc-1")!.services.find((s) => s.id === "svc-2")!.finalidadCode).toBeNull();
  });

  it("an encounter not present in the map is returned unchanged (defensive, should not normally happen)", () => {
    const before = dataMap([service()]);
    const after = applyRipsFieldCorrection(before, "does-not-exist", "svc-1", "finalidad_code", "11");
    expect(after).toBe(before);
  });

  it("does not mutate the original map (immutable update)", () => {
    const before = dataMap([service({ id: "svc-1", finalidadCode: null })]);
    applyRipsFieldCorrection(before, "enc-1", "svc-1", "finalidad_code", "11");
    expect(before.get("enc-1")!.services[0]!.finalidadCode).toBeNull();
  });
});
