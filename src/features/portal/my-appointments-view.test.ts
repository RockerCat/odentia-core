import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PortalAppointment } from "./appointments-data";
import type { PortalAppointmentRequest } from "./requests-data";
import {
  appointmentReasonLabel,
  buildMyAppointmentsView,
  HERO_HISTORY_LIMIT,
  NO_REASON_LABEL,
  professionalCardFields,
} from "./my-appointments-view";

// /portal/citas restores the approved "Próxima cita" layout — built ONLY
// from the patient's own real appointments/requests, with honest empties
// instead of the old mock screen's invented data.

const NOW = new Date("2026-09-24T18:00:00.000Z");
const MOCK_STRINGS = ["Valeria Muñoz", "Julián Restrepo", "Sonrisa Perfecta", "Laura", "María Gómez", "Odontología general", "Sin registrar"];

function appt(id: string, overrides: Partial<PortalAppointment> = {}): PortalAppointment {
  return {
    id,
    clinicId: "clinic-1",
    patientId: "patient-1",
    patientName: "Alex Paciente Borcelle2",
    patientPhone: null,
    professionalProfileId: "prof-1",
    startsAt: "2026-09-24T14:30:00.000Z",
    durationMinutes: 30,
    reason: "Chequeo general",
    room: null,
    contactPhone: null,
    notes: null,
    status: "completed",
    patientArrivedAt: null,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-24T15:00:00.000Z",
    professionalName: "Admin Borcelle 2",
    professionalAvatarUrl: null,
    professionalSpecialty: "Ortodoncia",
    professionalLicenseNumber: null,
    ...overrides,
  };
}

function request(overrides: Partial<PortalAppointmentRequest> = {}): PortalAppointmentRequest {
  return {
    id: "req-1",
    professionalProfileId: "prof-1",
    professionalName: "Admin Borcelle 2",
    preferredStartsAt: "2026-09-28T14:00:00.000Z",
    status: "pending",
    acceptedAppointmentId: null,
    createdAt: "2026-09-24T17:00:00.000Z",
    ...overrides,
  };
}

describe("buildMyAppointmentsView", () => {
  it("next real appointment → exactly that Cita and its real professional fields", () => {
    const next = appt("next", {
      startsAt: "2026-09-29T15:00:00.000Z",
      status: "scheduled",
      reason: "Control de ortodoncia",
      professionalAvatarUrl: "https://storage.example/avatar.png",
      professionalLicenseNumber: "RM-123",
    });
    const view = buildMyAppointmentsView([appt("past"), next], [], NOW);
    expect(view.nextAppointment).toBe(next);
    expect(professionalCardFields(next)).toEqual({
      name: "Admin Borcelle 2",
      initials: "A2",
      avatarUrl: "https://storage.example/avatar.png",
      specialty: "Ortodoncia",
      licenseNumber: "RM-123",
    });
    expect(appointmentReasonLabel(next)).toBe("Control de ortodoncia");
  });

  it("no upcoming Cita (pilot today) → null next appointment, never a fictitious one; history still real", () => {
    const view = buildMyAppointmentsView([appt("a"), appt("b", { startsAt: "2026-09-24T17:30:00.000Z" })], [], NOW);
    expect(view.nextAppointment).toBeNull();
    expect(view.otherUpcoming).toEqual([]);
    expect(view.heroHistory.map((a) => a.id)).toEqual(["b", "a"]); // newest first
    expect(view.pendingRequest).toBeNull();
  });

  it("history is only the patient's own given rows, newest first, capped for the panel", () => {
    const many = Array.from({ length: HERO_HISTORY_LIMIT + 3 }, (_, i) => appt(`h${i}`, { startsAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString() }));
    const view = buildMyAppointmentsView(many, [], NOW);
    expect(view.heroHistory).toHaveLength(HERO_HISTORY_LIMIT);
    expect(view.history).toHaveLength(many.length);
    expect(view.heroHistory[0].id).toBe(`h${many.length - 1}`);
    expect(buildMyAppointmentsView([], [], NOW)).toEqual({ nextAppointment: null, otherUpcoming: [], heroHistory: [], history: [], pendingRequest: null });
  });

  it("a pending Solicitud is surfaced as a request, never as a Cita", () => {
    const view = buildMyAppointmentsView([], [request({ status: "rejected", id: "old" }), request()], NOW);
    expect(view.pendingRequest?.id).toBe("req-1");
    expect(view.nextAppointment).toBeNull();
  });

  it("missing photo/specialty/registro/reason → honest omission, never an invented value", () => {
    const bare = appt("bare", { professionalAvatarUrl: null, professionalSpecialty: null, professionalLicenseNumber: "  ", reason: null });
    expect(professionalCardFields(bare)).toEqual({ name: "Admin Borcelle 2", initials: "A2", avatarUrl: undefined, specialty: null, licenseNumber: null });
    expect(appointmentReasonLabel(bare)).toBe(NO_REASON_LABEL);
    expect(NO_REASON_LABEL).not.toBe("Consulta");
  });
});

describe("/portal/citas sources", () => {
  const dir = path.resolve(__dirname);
  const screen = fs.readFileSync(path.join(dir, "my-appointments-screen.tsx"), "utf8");

  it("'Agendar nueva cita' opens the existing real scheduler (request_my_appointment) — no second request path", () => {
    expect(screen).toContain("<RequestAppointmentScheduler professionals={professionals} onRequested={handleRequested} />");
    expect(screen).toContain("Agendar nueva cita");
    expect(screen).toContain("Volver a Mis citas");
    expect(screen).not.toContain("RequestAppointmentModal");
    const scheduler = fs.readFileSync(path.join(dir, "request-appointment-scheduler.tsx"), "utf8");
    expect(scheduler).toContain("requestMyAppointment(");
  });

  it("no Reprogramar/Cancelar for the Patient (no real backend) and no invented fallbacks", () => {
    const code = screen.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    expect(code).not.toMatch(/>\s*Reprogramar\s*<|Cancelar cita/);
    expect(code).not.toContain('"Odontología general"');
    expect(code).not.toContain('?? "Consulta"');
  });

  it("loading shows a skeleton, never mock/previous data; no mock strings anywhere on this route", () => {
    const loading = fs.readFileSync(path.resolve(dir, "../../app/portal/citas/loading.tsx"), "utf8");
    expect(loading).toContain("animate-pulse");
    const codeOnly = (text: string) => text.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    for (const file of [screen, loading, fs.readFileSync(path.join(dir, "my-appointments-view.ts"), "utf8")]) {
      for (const s of MOCK_STRINGS.filter((m) => m !== "Sin registrar")) expect(codeOnly(file)).not.toContain(s);
    }
  });
});
