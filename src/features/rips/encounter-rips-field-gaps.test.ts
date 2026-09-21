import { describe, expect, it } from "vitest";
import { groupEncounterRipsFieldGaps } from "./encounter-rips-field-gaps";
import type { RipsReadinessError } from "./export-readiness";

function finalidadError(overrides: Partial<RipsReadinessError> = {}): RipsReadinessError {
  return {
    code: "SERVICE_FINALIDAD_MISSING",
    scope: "service",
    encounterId: "encounter-1",
    serviceId: "service-1",
    patientId: "patient-1",
    message: "irrelevant for this test",
    fixHref: null,
    ...overrides,
  };
}

function causaError(overrides: Partial<RipsReadinessError> = {}): RipsReadinessError {
  return { ...finalidadError(overrides), code: "CONSULTATION_CAUSA_MOTIVO_MISSING" };
}

describe("groupEncounterRipsFieldGaps", () => {
  it("a service missing only Finalidad gets one entry with missingFinalidad=true, missingCausaMotivo=false", () => {
    const groups = groupEncounterRipsFieldGaps([finalidadError()]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.encounterId).toBe("encounter-1");
    expect(groups[0]!.services).toEqual([{ serviceId: "service-1", missingFinalidad: true, missingCausaMotivo: false }]);
  });

  it("a consultation missing BOTH Finalidad and Causa collapses into ONE service entry with both flags true, not two", () => {
    const groups = groupEncounterRipsFieldGaps([finalidadError(), causaError()]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.services).toEqual([{ serviceId: "service-1", missingFinalidad: true, missingCausaMotivo: true }]);
  });

  it("two different services in the SAME encounter produce one group with two service entries", () => {
    const groups = groupEncounterRipsFieldGaps([
      finalidadError({ serviceId: "service-1" }),
      finalidadError({ serviceId: "service-2" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.services.map((s) => s.serviceId)).toEqual(["service-1", "service-2"]);
  });

  it("two different encounters produce two independent groups, in first-seen order", () => {
    const groups = groupEncounterRipsFieldGaps([
      finalidadError({ encounterId: "encounter-1", serviceId: "service-1" }),
      finalidadError({ encounterId: "encounter-2", serviceId: "service-3" }),
      causaError({ encounterId: "encounter-1", serviceId: "service-2" }),
    ]);
    expect(groups.map((g) => g.encounterId)).toEqual(["encounter-1", "encounter-2"]);
    expect(groups[0]!.services.map((s) => s.serviceId)).toEqual(["service-1", "service-2"]);
    expect(groups[1]!.services.map((s) => s.serviceId)).toEqual(["service-3"]);
  });

  it("never includes an error of a different code, even one sharing the same scope/encounter", () => {
    const groups = groupEncounterRipsFieldGaps([
      finalidadError({ serviceId: "service-1" }),
      { code: "SERVICE_VALUE_MISSING", scope: "service", encounterId: "encounter-1", serviceId: "service-2", message: "m", fixHref: null },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.services.map((s) => s.serviceId)).toEqual(["service-1"]);
  });

  it("no relevant errors at all → no groups", () => {
    expect(groupEncounterRipsFieldGaps([])).toEqual([]);
    expect(
      groupEncounterRipsFieldGaps([{ scope: "clinic", code: "CLINIC_TAX_ID_MISSING", message: "m", fixHref: null }]),
    ).toEqual([]);
  });

  it("an error missing encounterId or serviceId is skipped rather than crashing or producing a blank group", () => {
    const groups = groupEncounterRipsFieldGaps([
      { code: "SERVICE_FINALIDAD_MISSING", scope: "service", message: "m", fixHref: null },
    ]);
    expect(groups).toEqual([]);
  });
});
