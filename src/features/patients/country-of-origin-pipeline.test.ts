import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupPatientRipsGaps, PATIENT_MISSING_FIELD_LABELS } from "@/features/rips/patient-rips-gaps";
import type { RipsReadinessError } from "@/features/rips/export-readiness";

// Pilot RIPS: /rips said "Alex Paciente Borcelle2 — falta el país de
// origen." Root cause: readiness requires patients.country_of_origin_code
// (U11 codPaisOrigen) but NOTHING could ever write it — Nuevo paciente
// only asked País de residencia, createPatient() never sent it, Editar
// datos had no field, and /rips's own patient correction didn't map
// PATIENT_COUNTRY_ORIGIN_MISSING. Readiness → export already read the
// column correctly (see export-readiness/export-generator tests).

let lastInsert: Record<string, unknown> | null = null;
let lastUpdate: Record<string, unknown> | null = null;

const ROW = {
  id: "patient-1",
  first_name: "Alex",
  last_name: "Paciente",
  document_id: "CC 1",
  phone: "3000000000",
  email: null,
  birth_date: "2006-01-25",
  active: true,
  created_at: "2026-09-24T12:00:00.000Z",
  document_type: "CC",
  document_number: "1",
  sex_code: "M",
  user_type_code: "01",
  country_of_residence_code: "170",
  municipality_of_residence_code: "15001",
  residence_zone_code: "01",
  country_of_origin_code: "862",
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        lastInsert = payload;
        return { select: () => ({ single: async () => ({ data: { ...ROW, country_of_origin_code: payload.country_of_origin_code }, error: null }) }) };
      },
      update: (payload: Record<string, unknown>) => {
        lastUpdate = payload;
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

const { createPatient, updatePatient } = await import("./actions");

const BASE_INPUT = {
  clinicId: "clinic-1",
  firstName: "Alex",
  lastName: "Paciente",
  documentType: "CC",
  documentNumber: "1",
  phone: "3000000000",
  email: null,
  birthDate: "2006-01-25",
  sexCode: "M",
  userTypeCode: "01",
  countryOfResidenceCode: "170",
  municipalityOfResidenceCode: "15001",
  residenceZoneCode: "01",
};

describe("país de origen — create → read → edit → /rips correction", () => {
  beforeEach(() => {
    lastInsert = null;
    lastUpdate = null;
  });

  it("createPatient persists the explicitly selected origin in its own column, distinct from residence", async () => {
    const outcome = await createPatient({ ...BASE_INPUT, countryOfOriginCode: "862" });
    expect(lastInsert).toMatchObject({ country_of_residence_code: "170", country_of_origin_code: "862" });
    // Read-back (mapRow) keeps it.
    expect(outcome.status === "ok" && outcome.patient.countryOfOriginCode).toBe("862");
    expect(outcome.status === "ok" && outcome.patient.countryOfResidenceCode).toBe("170");
  });

  it("never copies residence into origin — an unset origin is sent as null, not 170", async () => {
    await createPatient({ ...BASE_INPUT, countryOfOriginCode: null });
    expect(lastInsert?.country_of_origin_code).toBeNull();
  });

  it("an edit that doesn't include origin never touches the column (no accidental erase)", async () => {
    await updatePatient("patient-1", { phone: "3111111111" });
    expect(lastUpdate).toEqual({ phone: "3111111111" });
    expect(lastUpdate && "country_of_origin_code" in lastUpdate).toBe(false);
  });

  it("an edit that sets origin writes exactly that value", async () => {
    await updatePatient("patient-1", { countryOfOriginCode: "170" });
    expect(lastUpdate).toEqual({ country_of_origin_code: "170" });
  });

  it("/rips patient correction now offers País de origen for PATIENT_COUNTRY_ORIGIN_MISSING", () => {
    const errors = [
      {
        code: "PATIENT_COUNTRY_ORIGIN_MISSING",
        scope: "patient",
        message: "Alex Paciente Borcelle2 — falta el país de origen.",
        patientId: "patient-1",
        patientName: "Alex Paciente Borcelle2",
      },
    ] as unknown as RipsReadinessError[];
    const groups = groupPatientRipsGaps(errors);
    expect(groups).toHaveLength(1);
    expect(groups[0].missingFields).toEqual(["countryOfOriginCode"]);
    expect(PATIENT_MISSING_FIELD_LABELS.countryOfOriginCode).toBe("País de origen");
  });
});
