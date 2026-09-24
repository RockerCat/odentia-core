import { describe, expect, it } from "vitest";
import type { ClinicalEncounterRecord, EncounterClinicalData, EncounterServiceRecord } from "@/features/patients/clinical-encounters-data";
import type { PatientMedicalHistory } from "@/features/patients/medical-history-data";
import { buildDentalHealthView, type DentalHealthInput } from "./dental-health-data";

// /portal/salud used to be 100% mock (a fictitious patient's allergies,
// dentist and appointments). It now shows only buildDentalHealthView's
// output, built from the patient's own real reads.

const MOCK_STRINGS = ["Valeria Muñoz", "Laura", "María Gómez", "Sonrisa Perfecta", "Andrés Bermúdez", "d1", "d2", "d3"];

function encounter(id: string, overrides: Partial<ClinicalEncounterRecord> = {}): ClinicalEncounterRecord {
  return {
    id,
    patientId: "patient-1",
    appointmentId: `appt-${id}`,
    occurredAt: "2026-09-24T14:14:00.000Z",
    reason: "Chequeo general",
    diagnosis: null,
    treatment: null,
    notes: null,
    indications: null,
    incapacityCode: "02",
    attendedBy: "profile-admin",
    finalizedAt: "2026-09-24T15:00:00.000Z",
    createdAt: "2026-09-24T14:14:00.000Z",
    ...overrides,
  };
}

function service(overrides: Partial<EncounterServiceRecord>): EncounterServiceRecord {
  return { cupsCode: "890222", clinicalConceptNameSnapshot: "Consulta de ortodoncia", ...overrides } as EncounterServiceRecord;
}

const HISTORY = { allergies: "Penicilina" } as PatientMedicalHistory;

function input(overrides: Partial<DentalHealthInput> = {}): DentalHealthInput {
  return {
    medicalHistory: { status: "ok", value: HISTORY },
    encounters: { status: "ok", value: [encounter("e2", { occurredAt: "2026-09-24T17:30:00.000Z" }), encounter("e1")] },
    encounterClinicalData: {
      status: "ok",
      value: new Map<string, EncounterClinicalData>([
        ["e2", { diagnoses: [], services: [service({})] }],
        ["e1", { diagnoses: [], services: [service({}), service({ cupsCode: "997002", clinicalConceptNameSnapshot: null })] }],
      ]),
    },
    professionalNames: new Map([["profile-admin", "Admin Borcelle 2"]]),
    ...overrides,
  };
}

describe("buildDentalHealthView — real data only", () => {
  it("shows exactly the patient's own real data", () => {
    const view = buildDentalHealthView(input());
    expect(view.allergies).toEqual({ status: "ok", value: "Penicilina" });
    expect(view.usualDentistName).toEqual({ status: "ok", value: "Admin Borcelle 2" });
    expect(view.recentServices).toEqual({ status: "ok", value: ["Consulta de ortodoncia", "CUPS 997002"] });
    expect(view.recentEncounters).toEqual({
      status: "ok",
      value: [
        { id: "e2", occurredAt: "2026-09-24T17:30:00.000Z", professionalName: "Admin Borcelle 2", reason: "Chequeo general" },
        { id: "e1", occurredAt: "2026-09-24T14:14:00.000Z", professionalName: "Admin Borcelle 2", reason: "Chequeo general" },
      ],
    });
    const text = JSON.stringify(view);
    for (const s of MOCK_STRINGS) expect(text).not.toContain(s);
  });

  it("no data → honest empties, never invented values or zeros", () => {
    const view = buildDentalHealthView(
      input({
        medicalHistory: { status: "ok", value: null },
        encounters: { status: "ok", value: [] },
        encounterClinicalData: { status: "ok", value: new Map() },
        professionalNames: new Map(),
      }),
    );
    expect(view).toEqual({
      allergies: { status: "ok", value: null },
      usualDentistName: { status: "ok", value: null },
      recentServices: { status: "ok", value: [] },
      recentEncounters: { status: "ok", value: [] },
    });
  });

  it("blank allergies text is no allergy alert; an unresolvable professional stays unnamed", () => {
    const view = buildDentalHealthView(input({ medicalHistory: { status: "ok", value: { allergies: "   " } as PatientMedicalHistory }, professionalNames: new Map() }));
    expect(view.allergies).toEqual({ status: "ok", value: null });
    expect(view.usualDentistName).toEqual({ status: "ok", value: null });
    expect(view.recentEncounters.status === "ok" && view.recentEncounters.value.every((e) => e.professionalName === null)).toBe(true);
  });

  it("a failed read is an error state for exactly its sections — never an empty list or a fallback", () => {
    const encountersFailed = buildDentalHealthView(input({ encounters: { status: "error" } }));
    expect(encountersFailed.allergies).toEqual({ status: "ok", value: "Penicilina" });
    expect(encountersFailed.usualDentistName).toEqual({ status: "error" });
    expect(encountersFailed.recentServices).toEqual({ status: "error" });
    expect(encountersFailed.recentEncounters).toEqual({ status: "error" });

    expect(buildDentalHealthView(input({ medicalHistory: { status: "error" } })).allergies).toEqual({ status: "error" });
    const servicesFailed = buildDentalHealthView(input({ encounterClinicalData: { status: "error" } }));
    expect(servicesFailed.recentServices).toEqual({ status: "error" });
    expect(servicesFailed.recentEncounters.status).toBe("ok");
  });

  it("usual dentist follows the shared rule: whoever attended the latest finalized atención", () => {
    const view = buildDentalHealthView(
      input({
        encounters: { status: "ok", value: [encounter("new", { attendedBy: "profile-b" }), encounter("old", { attendedBy: "profile-admin" })] },
        professionalNames: new Map([["profile-admin", "Admin Borcelle 2"], ["profile-b", "Dra. B"]]),
      }),
    );
    expect(view.usualDentistName).toEqual({ status: "ok", value: "Dra. B" });
  });
});
