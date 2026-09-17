import { describe, expect, it } from "vitest";
import { groupEncounterServiceRipsGaps } from "./encounter-service-rips-gaps";
import type { RipsReadinessError } from "./export-readiness";

// Prompt Master A4B — regression coverage for the exact grouping rule
// this module exists to enforce: one correction per encounter_id, never
// one per readiness error, and only RIPS_SERVICE_CONFIGURATION_MISSING
// ever participates.

function serviceGapError(overrides: Partial<RipsReadinessError> = {}): RipsReadinessError {
  return {
    code: "RIPS_SERVICE_CONFIGURATION_MISSING",
    scope: "service",
    encounterId: "encounter-1",
    serviceId: "service-1",
    patientId: "patient-1",
    message: "irrelevant for this test",
    fixHref: "/clinica#rips",
    ...overrides,
  };
}

describe("groupEncounterServiceRipsGaps", () => {
  it("REGRESSION: two service errors for the SAME encounter produce ONE group with both serviceIds, never two", () => {
    const groups = groupEncounterServiceRipsGaps([
      serviceGapError({ serviceId: "service-1" }),
      serviceGapError({ serviceId: "service-2" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.encounterId).toBe("encounter-1");
    expect(groups[0]!.serviceIds).toEqual(["service-1", "service-2"]);
  });

  it("serviceIds are deduplicated, even if the same one appears twice", () => {
    const groups = groupEncounterServiceRipsGaps([
      serviceGapError({ serviceId: "service-1" }),
      serviceGapError({ serviceId: "service-1" }),
    ]);
    expect(groups[0]!.serviceIds).toEqual(["service-1"]);
  });

  it("two different encounters produce two independent groups, in first-seen order", () => {
    const groups = groupEncounterServiceRipsGaps([
      serviceGapError({ encounterId: "encounter-1", serviceId: "service-1" }),
      serviceGapError({ encounterId: "encounter-2", serviceId: "service-3" }),
      serviceGapError({ encounterId: "encounter-1", serviceId: "service-2" }),
    ]);
    expect(groups.map((g) => g.encounterId)).toEqual(["encounter-1", "encounter-2"]);
    expect(groups[0]!.serviceIds).toEqual(["service-1", "service-2"]);
    expect(groups[1]!.serviceIds).toEqual(["service-3"]);
  });

  it("never includes an error of a different code, even one sharing the same scope/encounter", () => {
    const groups = groupEncounterServiceRipsGaps([
      serviceGapError({ serviceId: "service-1" }),
      {
        code: "SERVICE_VALUE_MISSING",
        scope: "service",
        encounterId: "encounter-1",
        serviceId: "service-2",
        message: "m",
        fixHref: "/rips/atencion/encounter-1",
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.serviceIds).toEqual(["service-1"]);
  });

  it("no RIPS_SERVICE_CONFIGURATION_MISSING errors at all → no groups", () => {
    expect(groupEncounterServiceRipsGaps([])).toEqual([]);
    expect(
      groupEncounterServiceRipsGaps([{ scope: "clinic", code: "CLINIC_TAX_ID_MISSING", message: "m", fixHref: "/clinica#rips" }]),
    ).toEqual([]);
  });

  it("an error missing encounterId or serviceId is skipped rather than crashing or producing a blank group", () => {
    const groups = groupEncounterServiceRipsGaps([
      { code: "RIPS_SERVICE_CONFIGURATION_MISSING", scope: "service", message: "m", fixHref: "/clinica#rips" },
    ]);
    expect(groups).toEqual([]);
  });
});
