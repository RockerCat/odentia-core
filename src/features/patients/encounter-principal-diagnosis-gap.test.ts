import { describe, expect, it } from "vitest";
import type { EncounterClinicalData, EncounterDiagnosisRecord } from "./clinical-encounters-data";
import {
  applyPrincipalDiagnosisCorrection,
  hasMissingPrincipalDiagnosis,
  shouldShowMissingPrincipalDiagnosisIndicator,
} from "./encounter-principal-diagnosis-gap";

function principal(overrides: Partial<EncounterDiagnosisRecord> = {}): EncounterDiagnosisRecord {
  return {
    id: "dx-1",
    encounterId: "enc-1",
    cie10Code: "Z012",
    role: "principal",
    diagnosisTypeCode: "01",
    encounterServiceId: null,
    sequence: 0,
    ...overrides,
  };
}

describe("hasMissingPrincipalDiagnosis", () => {
  it("a classified service with no diagnoses at all -> gap", () => {
    expect(hasMissingPrincipalDiagnosis([], [{ id: "svc-1", ripsServiceType: "consultation" }])).toBe(true);
  });

  it("an encounter-wide principal covers every classified service -> no gap", () => {
    expect(
      hasMissingPrincipalDiagnosis([principal()], [
        { id: "svc-1", ripsServiceType: "consultation" },
        { id: "svc-2", ripsServiceType: "procedure" },
      ]),
    ).toBe(false);
  });

  it("only a related diagnosis present (no principal) -> still a gap", () => {
    expect(
      hasMissingPrincipalDiagnosis([principal({ role: "related", diagnosisTypeCode: null })], [
        { id: "svc-1", ripsServiceType: "consultation" },
      ]),
    ).toBe(true);
  });

  it("an unknown-classified service is never considered (no CUPS classification to resolve against)", () => {
    expect(hasMissingPrincipalDiagnosis([], [{ id: "svc-1", ripsServiceType: "unknown" }])).toBe(false);
  });

  it("no services at all -> no gap", () => {
    expect(hasMissingPrincipalDiagnosis([], [])).toBe(false);
  });
});

describe("shouldShowMissingPrincipalDiagnosisIndicator", () => {
  it("canEditClinicalData=true + a gap -> true", () => {
    expect(shouldShowMissingPrincipalDiagnosisIndicator(true, [], [{ id: "svc-1", ripsServiceType: "consultation" }])).toBe(true);
  });

  it("canEditClinicalData=false + a gap -> false (never shown to a role with no clinical write authority)", () => {
    expect(shouldShowMissingPrincipalDiagnosisIndicator(false, [], [{ id: "svc-1", ripsServiceType: "consultation" }])).toBe(false);
  });

  it("canEditClinicalData=true + principal present -> false", () => {
    expect(
      shouldShowMissingPrincipalDiagnosisIndicator(true, [principal()], [{ id: "svc-1", ripsServiceType: "consultation" }]),
    ).toBe(false);
  });
});

describe("applyPrincipalDiagnosisCorrection", () => {
  function dataMap(diagnoses: EncounterDiagnosisRecord[]): Map<string, EncounterClinicalData> {
    return new Map([["enc-1", { diagnoses, services: [] }]]);
  }

  it("appends the new encounter-wide principal, removing the gap", () => {
    const before = dataMap([]);
    const after = applyPrincipalDiagnosisCorrection(before, "enc-1", { id: "dx-new", sequence: 0, cie10Code: "Z012", diagnosisTypeCode: "01" });
    const diagnoses = after.get("enc-1")!.diagnoses;
    expect(diagnoses).toHaveLength(1);
    expect(hasMissingPrincipalDiagnosis(diagnoses, [{ id: "svc-1", ripsServiceType: "consultation" }])).toBe(false);
  });

  it("never touches a pre-existing related diagnosis on the same encounter", () => {
    const existingRelated = principal({ id: "dx-related", role: "related", diagnosisTypeCode: null, cie10Code: "K021" });
    const before = dataMap([existingRelated]);
    const after = applyPrincipalDiagnosisCorrection(before, "enc-1", { id: "dx-new", sequence: 1, cie10Code: "Z012", diagnosisTypeCode: "01" });
    const diagnoses = after.get("enc-1")!.diagnoses;
    expect(diagnoses).toHaveLength(2);
    expect(diagnoses.find((d) => d.id === "dx-related")).toEqual(existingRelated);
  });

  it("an encounter not present in the map is returned unchanged (defensive, should not normally happen)", () => {
    const before = dataMap([]);
    const after = applyPrincipalDiagnosisCorrection(before, "does-not-exist", { id: "dx-new", sequence: 0, cie10Code: "Z012", diagnosisTypeCode: null });
    expect(after).toBe(before);
  });

  it("does not mutate the original map (immutable update)", () => {
    const before = dataMap([]);
    applyPrincipalDiagnosisCorrection(before, "enc-1", { id: "dx-new", sequence: 0, cie10Code: "Z012", diagnosisTypeCode: "01" });
    expect(before.get("enc-1")!.diagnoses).toHaveLength(0);
  });
});
