import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClinicalEncounterRecord } from "./clinical-encounters-data";
import type { Patient } from "./data";
import { buildRealClinicalRecordPdfData } from "./pdf/real-clinical-record-data";

// Pilot E2E: same patient, one completed atención by Admin Borcelle 2 —
// the Paciente modal showed "Admin Borcelle 2" (derived from the latest
// finalized encounter) while Historia Clínica and its PDF hardcoded "Aún
// sin odontólogo". Every surface now uses usual-dentist.ts's one rule.

const resolveUpdatedByProfessional = vi.fn();
vi.mock("./resolve-updated-by", () => ({ resolveUpdatedByProfessional: (...args: unknown[]) => resolveUpdatedByProfessional(...args) }));

const { resolveUsualDentistName, usualDentistProfileIdFrom } = await import("./usual-dentist");

function encounter(overrides: Partial<ClinicalEncounterRecord>): ClinicalEncounterRecord {
  return {
    id: "enc-1",
    patientId: "patient-1",
    appointmentId: "appt-1",
    occurredAt: "2026-09-24T15:00:00.000Z",
    reason: null,
    diagnosis: null,
    treatment: null,
    notes: null,
    indications: null,
    incapacityCode: "02",
    attendedBy: "profile-admin-borcelle-2",
    finalizedAt: "2026-09-24T15:40:00.000Z",
    createdAt: "2026-09-24T15:00:00.000Z",
    ...overrides,
  };
}

const PATIENT = { id: "patient-1", firstName: "Paciente", lastName: "Piloto", createdAt: "2026-09-24T12:00:00.000Z" } as Patient;
const supabase = {} as SupabaseClient;

describe("usual dentist — one rule for modal, Historia Clínica and PDF", () => {
  beforeEach(() => {
    resolveUpdatedByProfessional.mockReset();
    resolveUpdatedByProfessional.mockResolvedValue({ name: "Admin Borcelle 2", avatarUrl: null, specialtyName: "Ortodoncia" });
  });

  it("is whoever attended the latest finalized atención (list is occurred_at desc)", () => {
    const encounters = [encounter({ id: "newer", attendedBy: "profile-b" }), encounter({ id: "older", attendedBy: "profile-a" })];
    expect(usualDentistProfileIdFrom(encounters)).toBe("profile-b");
    expect(usualDentistProfileIdFrom([])).toBeNull();
  });

  it("pilot: the Historia Clínica path resolves the same name the modal showed", async () => {
    await expect(resolveUsualDentistName(supabase, "clinic-1", [encounter({})])).resolves.toBe("Admin Borcelle 2");
    expect(resolveUpdatedByProfessional).toHaveBeenCalledWith(supabase, "clinic-1", "profile-admin-borcelle-2");
  });

  it("the PDF resolves the same name from its professional directory", () => {
    const data = buildRealClinicalRecordPdfData({
      patient: PATIENT,
      medicalHistory: null,
      toothFindings: [],
      clinicalEncounters: [encounter({})],
      clinicalDocuments: [],
      clinicalNotes: [],
      treatmentPlanItems: [],
      professionals: new Map([["profile-admin-borcelle-2", { name: "Admin Borcelle 2", specialtyName: "Ortodoncia" }]]),
    });
    expect(data.usualDentistName).toBe("Admin Borcelle 2");
  });

  it("no finalized atención yet, or an author no longer on the team → null (each view's own empty state), never invented", async () => {
    await expect(resolveUsualDentistName(supabase, "clinic-1", [])).resolves.toBeNull();
    expect(resolveUpdatedByProfessional).not.toHaveBeenCalled();
    resolveUpdatedByProfessional.mockResolvedValueOnce(null);
    await expect(resolveUsualDentistName(supabase, "clinic-1", [encounter({})])).resolves.toBeNull();
    const pdf = buildRealClinicalRecordPdfData({
      patient: PATIENT,
      medicalHistory: null,
      toothFindings: [],
      clinicalEncounters: [encounter({ attendedBy: "profile-gone" })],
      clinicalDocuments: [],
      clinicalNotes: [],
      treatmentPlanItems: [],
      professionals: new Map(),
    });
    expect(pdf.usualDentistName).toBeNull();
  });
});
