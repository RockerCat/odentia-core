import { describe, expect, it } from "vitest";
import { groupEncounterPrincipalDiagnosisGaps } from "./encounter-principal-diagnosis-gaps";
import type { RipsReadinessError } from "./export-readiness";

function gapError(overrides: Partial<RipsReadinessError> = {}): RipsReadinessError {
  return {
    code: "ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING",
    scope: "encounter",
    encounterId: "encounter-1",
    serviceId: "service-1",
    patientId: "patient-1",
    message: "irrelevant for this test",
    fixHref: null,
    ...overrides,
  };
}

describe("groupEncounterPrincipalDiagnosisGaps", () => {
  it("multiple services missing a principal in the SAME encounter collapse into ONE group, never one per service", () => {
    const groups = groupEncounterPrincipalDiagnosisGaps([
      gapError({ serviceId: "service-1" }),
      gapError({ serviceId: "service-2" }),
    ]);
    expect(groups).toEqual([{ encounterId: "encounter-1" }]);
  });

  it("two different encounters produce two independent groups, in first-seen order", () => {
    const groups = groupEncounterPrincipalDiagnosisGaps([
      gapError({ encounterId: "encounter-1" }),
      gapError({ encounterId: "encounter-2" }),
      gapError({ encounterId: "encounter-1", serviceId: "service-2" }),
    ]);
    expect(groups.map((g) => g.encounterId)).toEqual(["encounter-1", "encounter-2"]);
  });

  it("never includes an error of a different code, even one sharing the same scope/encounter", () => {
    const groups = groupEncounterPrincipalDiagnosisGaps([
      gapError({ encounterId: "encounter-1" }),
      { code: "CONSULTATION_DIAGNOSIS_TYPE_MISSING", scope: "encounter", encounterId: "encounter-1", message: "m", fixHref: null },
    ]);
    expect(groups).toEqual([{ encounterId: "encounter-1" }]);
  });

  it("no relevant errors at all → no groups", () => {
    expect(groupEncounterPrincipalDiagnosisGaps([])).toEqual([]);
    expect(
      groupEncounterPrincipalDiagnosisGaps([{ scope: "clinic", code: "CLINIC_TAX_ID_MISSING", message: "m", fixHref: null }]),
    ).toEqual([]);
  });

  it("an error missing encounterId is skipped rather than crashing or producing a blank group", () => {
    const groups = groupEncounterPrincipalDiagnosisGaps([
      { code: "ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING", scope: "encounter", message: "m", fixHref: null },
    ]);
    expect(groups).toEqual([]);
  });
});
