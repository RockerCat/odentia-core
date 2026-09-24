import { beforeEach, describe, expect, it, vi } from "vitest";

// Pilot E2E (890222): the Causa/Motivo the professional explicitly selects
// on the service card must reach the upsert RPC as causa_motivo_code —
// the column the finalize/readiness rules and the DB's own
// RIPSCausaExternaVersion2 catalog check both read.

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const { upsertPatientClinicalEncounter } = await import("./clinical-encounters-actions");

describe("upsertPatientClinicalEncounter — causa/motivo persistence", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: { message: "stop after capturing args" } });
  });

  it("sends the selected causa as causa_motivo_code, alongside finalidad, for consultation 890222", async () => {
    await upsertPatientClinicalEncounter({
      patientId: "patient-1",
      appointmentId: "appt-1",
      occurredAt: "2026-09-24T15:00:00.000Z",
      reason: null,
      diagnosis: null,
      treatment: null,
      notes: null,
      indications: null,
      procedures: [],
      finalize: true,
      incapacityCode: "02",
      diagnoses: [{ cie10Code: "Z012", role: "principal", diagnosisTypeCode: "02" }],
      services: [{ cupsCode: "890222", professionalProfileId: "prof-1", serviceValue: 60000, finalidadCode: "15", causaMotivoCode: "38" }],
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("upsert_patient_clinical_encounter");
    expect(args.p_services).toHaveLength(1);
    expect(args.p_services[0]).toMatchObject({ cups_code: "890222", finalidad_code: "15", causa_motivo_code: "38" });
  });

  it("an unselected causa is sent as null, never a silent default", async () => {
    await upsertPatientClinicalEncounter({
      patientId: "patient-1",
      appointmentId: "appt-1",
      occurredAt: "2026-09-24T15:00:00.000Z",
      reason: null,
      diagnosis: null,
      treatment: null,
      notes: null,
      indications: null,
      procedures: [],
      services: [{ cupsCode: "890222", professionalProfileId: "prof-1", causaMotivoCode: null }],
    });
    expect(rpc.mock.calls[0][1].p_services[0].causa_motivo_code).toBeNull();
  });
});
