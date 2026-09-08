import { describe, expect, it } from "vitest";
import { splitPortalAppointments } from "./appointments-split";
import type { PortalAppointment } from "./appointments-data";

// Regression coverage for "PROMPT NINJA — Portal Mis citas: corregir
// Próximas vs Historial" — próximas requires BOTH a future starts_at AND a
// non-terminal status; everything else (terminal, or past regardless of
// status) is historial.

const NOW = new Date("2026-09-07T12:00:00.000Z");

function makeAppointment(overrides: Partial<PortalAppointment>): PortalAppointment {
  return {
    id: "apt-1",
    clinicId: "clinic-1",
    patientId: "patient-1",
    patientName: "Paciente",
    patientPhone: null,
    professionalProfileId: "prof-1",
    startsAt: NOW.toISOString(),
    durationMinutes: 30,
    reason: null,
    room: null,
    contactPhone: null,
    notes: null,
    status: "scheduled",
    patientArrivedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    professionalName: "Dr. Profesional",
    professionalAvatarUrl: null,
    professionalSpecialty: null,
    professionalLicenseNumber: null,
    ...overrides,
  };
}

describe("splitPortalAppointments", () => {
  it("puts a future scheduled appointment in próximas", () => {
    const a = makeAppointment({ id: "a", status: "scheduled", startsAt: "2026-09-10T12:00:00.000Z" });
    const { upcoming, history } = splitPortalAppointments([a], NOW);
    expect(upcoming.map((x) => x.id)).toEqual(["a"]);
    expect(history).toEqual([]);
  });

  it("puts a future confirmed appointment in próximas", () => {
    const a = makeAppointment({ id: "a", status: "confirmed", startsAt: "2026-09-10T12:00:00.000Z" });
    const { upcoming, history } = splitPortalAppointments([a], NOW);
    expect(upcoming.map((x) => x.id)).toEqual(["a"]);
    expect(history).toEqual([]);
  });

  it("puts a future cancelled appointment in historial, never próximas", () => {
    const a = makeAppointment({ id: "a", status: "cancelled", startsAt: "2026-09-10T12:00:00.000Z" });
    const { upcoming, history } = splitPortalAppointments([a], NOW);
    expect(upcoming).toEqual([]);
    expect(history.map((x) => x.id)).toEqual(["a"]);
  });

  it("puts a past completed appointment in historial", () => {
    const a = makeAppointment({ id: "a", status: "completed", startsAt: "2026-09-01T12:00:00.000Z" });
    const { upcoming, history } = splitPortalAppointments([a], NOW);
    expect(upcoming).toEqual([]);
    expect(history.map((x) => x.id)).toEqual(["a"]);
  });

  it("puts a past no_show appointment in historial", () => {
    const a = makeAppointment({ id: "a", status: "no_show", startsAt: "2026-09-01T12:00:00.000Z" });
    const { upcoming, history } = splitPortalAppointments([a], NOW);
    expect(upcoming).toEqual([]);
    expect(history.map((x) => x.id)).toEqual(["a"]);
  });

  it("puts a past scheduled appointment in historial (display status derives 'Sin cerrar' elsewhere, status itself is untouched)", () => {
    const a = makeAppointment({ id: "a", status: "scheduled", startsAt: "2026-09-01T12:00:00.000Z" });
    const { upcoming, history } = splitPortalAppointments([a], NOW);
    expect(upcoming).toEqual([]);
    expect(history.map((x) => x.id)).toEqual(["a"]);
    expect(history[0].status).toBe("scheduled");
  });

  it("puts a past in_progress appointment in historial (status itself never auto-converted)", () => {
    const a = makeAppointment({ id: "a", status: "in_progress", startsAt: "2026-09-01T12:00:00.000Z" });
    const { upcoming, history } = splitPortalAppointments([a], NOW);
    expect(upcoming).toEqual([]);
    expect(history.map((x) => x.id)).toEqual(["a"]);
    expect(history[0].status).toBe("in_progress");
  });

  it("orders próximas ascending (soonest first) and historial descending (most recent first)", () => {
    const soon = makeAppointment({ id: "soon", status: "scheduled", startsAt: "2026-09-08T12:00:00.000Z" });
    const later = makeAppointment({ id: "later", status: "confirmed", startsAt: "2026-09-20T12:00:00.000Z" });
    const oldest = makeAppointment({ id: "oldest", status: "completed", startsAt: "2026-08-01T12:00:00.000Z" });
    const recent = makeAppointment({ id: "recent", status: "no_show", startsAt: "2026-09-05T12:00:00.000Z" });

    const { upcoming, history } = splitPortalAppointments([later, soon, oldest, recent], NOW);

    expect(upcoming.map((x) => x.id)).toEqual(["soon", "later"]);
    expect(history.map((x) => x.id)).toEqual(["recent", "oldest"]);
  });

  it("treats an appointment starting exactly now as próximas (starts_at >= now)", () => {
    const a = makeAppointment({ id: "a", status: "scheduled", startsAt: NOW.toISOString() });
    const { upcoming, history } = splitPortalAppointments([a], NOW);
    expect(upcoming.map((x) => x.id)).toEqual(["a"]);
    expect(history).toEqual([]);
  });
});
