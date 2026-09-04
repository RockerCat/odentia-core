import { describe, expect, it } from "vitest";
import { lastVisitLabelFrom, latestToothFindingUpdate, nextAppointmentLabelFrom } from "./resumen-tab";
import type { Appointment } from "@/features/dashboard/appointments-data";
import type { ClinicalEncounterRecord } from "./clinical-encounters-data";
import type { ToothFindingRecord } from "./tooth-findings-data";

// Regression coverage for the real bug: after completing
// cita → Iniciar atención → ... → Finalizar atención, Historia Clínica's
// Resumen tab kept showing "Sin atenciones registradas" even though the
// patient had several finalized encounters — ResumenTab never received
// clinicalEncounters at all (see patient-clinical-record-screen.tsx),
// and this card's value was a hardcoded literal string. This file
// exercises the fix in isolation from the DB — the query-level guarantee
// (finalized only, most-recent-first) that makes encounters[0] always
// correct is covered separately in clinical-encounters-data.test.ts.

function encounter(overrides: Partial<ClinicalEncounterRecord>): ClinicalEncounterRecord {
  return {
    id: "enc-1",
    patientId: "patient-1",
    appointmentId: "appt-1",
    occurredAt: "2026-09-04T15:35:25.221Z",
    reason: "Chequeo general",
    diagnosis: null,
    treatment: "Blanqueamiento dental",
    notes: "nota",
    indications: "indicaciones",
    attendedBy: null,
    finalizedAt: "2026-09-04T15:36:46.437Z",
    createdAt: "2026-09-04T15:35:25.691Z",
    ...overrides,
  };
}

describe("lastVisitLabelFrom", () => {
  it("shows the empty state only when there are truly zero finalized encounters", () => {
    expect(lastVisitLabelFrom([])).toBe("Sin atenciones registradas");
  });

  it("never shows the empty state once at least one finalized encounter exists (the exact reported bug)", () => {
    const label = lastVisitLabelFrom([encounter({})]);
    expect(label).not.toBe("Sin atenciones registradas");
    expect(label).toContain("Chequeo general");
  });

  it("uses encounters[0] — the caller (fetchPatientClinicalEncounters) already sorts most-recent-first", () => {
    const mostRecent = encounter({ id: "enc-recent", occurredAt: "2026-09-04T16:00:00.000Z", reason: "Control de ortodoncia" });
    const older = encounter({ id: "enc-older", occurredAt: "2026-09-01T21:00:00.000Z", reason: "Consulta de ortodoncia" });
    expect(lastVisitLabelFrom([mostRecent, older])).toContain("Control de ortodoncia");
  });

  it("falls back to 'Consulta' when the encounter has no reason, same as the approved demo's own fallback", () => {
    expect(lastVisitLabelFrom([encounter({ reason: null })])).toContain("Consulta");
  });
});

// Regression coverage for the same class of bug ("PROMPT NINJA — Auditar
// y conectar TODO el Resumen de Historia Clínica"), audited across all 8
// Resumen cards. "Próxima cita" and "Última actualización del odontograma"
// were still hardcoded literals — this exercises their real derivations.

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: "appt-1",
    clinicId: "clinic-1",
    patientId: "patient-1",
    patientName: "Laura Diaz",
    patientPhone: null,
    professionalProfileId: "prof-1",
    startsAt: "2026-09-10T14:00:00.000Z",
    durationMinutes: 30,
    reason: "Control de ortodoncia",
    room: null,
    contactPhone: null,
    notes: null,
    status: "confirmed",
    patientArrivedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = new Date("2026-09-04T12:00:00.000Z");

describe("nextAppointmentLabelFrom", () => {
  it("shows the empty state when there is no future non-terminal appointment", () => {
    expect(nextAppointmentLabelFrom([], NOW)).toBe("Sin cita programada");
  });

  it("never shows the empty state once a future non-terminal appointment exists", () => {
    const label = nextAppointmentLabelFrom([appointment({})], NOW);
    expect(label).not.toBe("Sin cita programada");
    expect(label).toContain("Control de ortodoncia");
  });

  it("picks the EARLIEST future appointment, not just any", () => {
    const soon = appointment({ id: "soon", startsAt: "2026-09-05T10:00:00.000Z", reason: "Chequeo general" });
    const later = appointment({ id: "later", startsAt: "2026-09-20T10:00:00.000Z", reason: "Limpieza dental" });
    expect(nextAppointmentLabelFrom([later, soon], NOW)).toContain("Chequeo general");
  });

  it("never derives from a past appointment, even a non-terminal (unresolved) one", () => {
    const past = appointment({ startsAt: "2026-09-01T08:00:00.000Z", status: "confirmed" });
    expect(nextAppointmentLabelFrom([past], NOW)).toBe("Sin cita programada");
  });

  it("excludes terminal appointments (completed/no_show/cancelled) even if their startsAt is in the future", () => {
    const cancelledFuture = appointment({ startsAt: "2026-09-10T08:00:00.000Z", status: "cancelled" });
    expect(nextAppointmentLabelFrom([cancelledFuture], NOW)).toBe("Sin cita programada");
  });

  it("never fabricates a próxima cita from clinical encounters — only reads the appointments array given", () => {
    // No encounters are ever passed to this function at all — its type
    // signature only accepts Appointment[], structurally guaranteeing this.
    expect(nextAppointmentLabelFrom([], NOW)).toBe("Sin cita programada");
  });
});

function finding(overrides: Partial<ToothFindingRecord>): ToothFindingRecord {
  return {
    id: "finding-1",
    patientId: "patient-1",
    toothFdi: 11,
    findingType: "caries",
    surfaces: ["oclusal"],
    note: null,
    recordedBy: "prof-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("latestToothFindingUpdate", () => {
  it("returns null when there are no findings", () => {
    expect(latestToothFindingUpdate([])).toBeNull();
  });

  it("returns the SINGLE most-recently-updated finding across the whole odontogram, not the first/last in array order", () => {
    const oldest = finding({ id: "oldest", toothFdi: 11, updatedAt: "2026-08-20T10:00:00.000Z" });
    const newest = finding({ id: "newest", toothFdi: 46, updatedAt: "2026-09-04T09:00:00.000Z" });
    const middle = finding({ id: "middle", toothFdi: 21, updatedAt: "2026-08-25T09:00:00.000Z" });
    expect(latestToothFindingUpdate([oldest, newest, middle])?.id).toBe("newest");
  });
});
