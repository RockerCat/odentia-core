import { describe, expect, it } from "vitest";
import { groupPatientRipsGaps } from "./patient-rips-gaps";
import type { RipsReadinessError } from "./export-readiness";

// Prompt Ninja — "corregir datos faltantes del paciente sin salir de
// /rips": regression coverage for the exact grouping rule the task
// requires — one correction per patient_id, never one per readiness
// error, and only the fields genuinely missing right now.

function patientError(overrides: Partial<RipsReadinessError> & Pick<RipsReadinessError, "code">): RipsReadinessError {
  return {
    scope: "patient",
    patientId: "patient-1",
    patientName: "Alex Paciente3",
    message: "irrelevant for this test",
    fixHref: "/pacientes",
    ...overrides,
  };
}

describe("groupPatientRipsGaps", () => {
  it("REGRESSION: multiple errors for the SAME patient produce ONE group with all missing fields, never three", () => {
    const groups = groupPatientRipsGaps([
      patientError({ code: "PATIENT_SEX_MISSING" }),
      patientError({ code: "PATIENT_USER_TYPE_MISSING" }),
      patientError({ code: "PATIENT_COUNTRY_RESIDENCE_MISSING" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.patientId).toBe("patient-1");
    expect(groups[0]!.patientName).toBe("Alex Paciente3");
    expect(groups[0]!.missingFields).toEqual(["sexCode", "userTypeCode", "countryOfResidenceCode"]);
  });

  it("a patient missing only one field produces a group with exactly that one field", () => {
    const groups = groupPatientRipsGaps([patientError({ code: "PATIENT_COUNTRY_RESIDENCE_MISSING" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.missingFields).toEqual(["countryOfResidenceCode"]);
  });

  it("never lists a field twice, even if the same code somehow appears more than once", () => {
    const groups = groupPatientRipsGaps([
      patientError({ code: "PATIENT_SEX_MISSING" }),
      patientError({ code: "PATIENT_SEX_MISSING" }),
    ]);
    expect(groups[0]!.missingFields).toEqual(["sexCode"]);
  });

  it("two different patients produce two independent groups, in first-seen order", () => {
    const groups = groupPatientRipsGaps([
      patientError({ code: "PATIENT_SEX_MISSING", patientId: "patient-1", patientName: "Alex Paciente3" }),
      patientError({ code: "PATIENT_COUNTRY_RESIDENCE_MISSING", patientId: "patient-2", patientName: "Otro Paciente" }),
      patientError({ code: "PATIENT_USER_TYPE_MISSING", patientId: "patient-1", patientName: "Alex Paciente3" }),
    ]);
    expect(groups.map((g) => g.patientId)).toEqual(["patient-1", "patient-2"]);
    expect(groups[0]!.missingFields).toEqual(["sexCode", "userTypeCode"]);
    expect(groups[1]!.missingFields).toEqual(["countryOfResidenceCode"]);
  });

  it("never includes a non-patient-scope error, even one that shares a patientId", () => {
    const groups = groupPatientRipsGaps([
      patientError({ code: "PATIENT_SEX_MISSING" }),
      { scope: "service", code: "RIPS_SERVICE_CONFIGURATION_MISSING", patientId: "patient-1", message: "m", fixHref: "/clinica#rips" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.missingFields).toEqual(["sexCode"]);
  });

  it("no patient-scope errors at all → no groups (the already-fixed/never-broken case)", () => {
    expect(groupPatientRipsGaps([])).toEqual([]);
    expect(
      groupPatientRipsGaps([{ scope: "clinic", code: "CLINIC_TAX_ID_MISSING", message: "m", fixHref: "/clinica#rips" }]),
    ).toEqual([]);
  });

  it("an error missing patientId is skipped rather than crashing or producing a blank group", () => {
    const groups = groupPatientRipsGaps([{ scope: "patient", code: "PATIENT_SEX_MISSING", message: "m", fixHref: "/pacientes" }]);
    expect(groups).toEqual([]);
  });
});
