import { describe, expect, it } from "vitest";
import { buildProceduresPayload, buildTreatmentText, isEncounterFinalized } from "./clinical-encounter-draft";

// Regression coverage for the Atención Clínica draft/finalized model (see
// the 20260903120000 migration): these are the exact rules
// RealClinicalEncounterScreen relies on for "Guardar borrador"/"Finalizar
// atención" to agree with upsert_patient_clinical_encounter's own
// server-side filtering.

describe("buildProceduresPayload", () => {
  it("drops rows with a blank or whitespace-only name, matching the RPC's own filter", () => {
    const result = buildProceduresPayload([
      { name: "Resina", note: "Molar" },
      { name: "", note: "should be dropped" },
      { name: "   ", note: "also dropped" },
      { name: "Limpieza", note: "" },
    ]);
    expect(result).toEqual([
      { name: "Resina", note: "Molar" },
      { name: "Limpieza", note: null },
    ]);
  });

  it("converts an empty note to null rather than an empty string", () => {
    expect(buildProceduresPayload([{ name: "Resina", note: "" }])).toEqual([{ name: "Resina", note: null }]);
  });

  it("returns an empty array for no procedures", () => {
    expect(buildProceduresPayload([])).toEqual([]);
  });
});

describe("buildTreatmentText", () => {
  it("joins procedure names with a comma", () => {
    expect(buildTreatmentText([{ name: "Resina", note: "" }, { name: "Limpieza", note: "" }])).toBe("Resina, Limpieza");
  });

  it("skips blank names when building the summary", () => {
    expect(buildTreatmentText([{ name: "", note: "" }, { name: "Resina", note: "" }])).toBe("Resina");
  });

  it("returns null (not an empty string) when there are no named procedures", () => {
    expect(buildTreatmentText([])).toBeNull();
    expect(buildTreatmentText([{ name: "", note: "" }])).toBeNull();
  });
});

describe("isEncounterFinalized", () => {
  it("is false for a null encounter (no draft or finalized row yet)", () => {
    expect(isEncounterFinalized(null)).toBe(false);
  });

  it("is false for a draft (finalizedAt null)", () => {
    expect(isEncounterFinalized({ finalizedAt: null })).toBe(false);
  });

  it("is true once finalizedAt is set", () => {
    expect(isEncounterFinalized({ finalizedAt: "2026-09-03T12:00:00.000Z" })).toBe(true);
  });
});
