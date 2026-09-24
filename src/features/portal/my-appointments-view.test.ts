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
    kind: "new",
    appointmentId: null,
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
    expect(buildMyAppointmentsView([], [], NOW)).toEqual({
      nextAppointment: null,
      otherUpcoming: [],
      heroHistory: [],
      history: [],
      pendingRequest: null,
      showDirectScheduler: true,
    });
  });

  it("a pending RESCHEDULE never blocks 'Agendar nueva cita' and is found per Cita", async () => {
    const { pendingRescheduleFor } = await import("./my-appointments-view");
    const reschedule = request({ id: "rs-1", kind: "reschedule", appointmentId: "next" });
    const view = buildMyAppointmentsView([], [reschedule], NOW);
    expect(view.pendingRequest).toBeNull();
    expect(pendingRescheduleFor("next", [reschedule])?.id).toBe("rs-1");
    expect(pendingRescheduleFor("other", [reschedule])).toBeNull();
    expect(pendingRescheduleFor("next", [{ ...reschedule, status: "rejected" }])).toBeNull();
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

describe("no upcoming Cita → scheduler directly (approved 'Agenda tu próxima cita con nosotros')", () => {
  it("no upcoming Cita + no pending NEW request → scheduler shown directly; history still derived", () => {
    const view = buildMyAppointmentsView([appt("past")], [], NOW);
    expect(view.showDirectScheduler).toBe(true);
    expect(view.heroHistory.map((a) => a.id)).toEqual(["past"]);
  });

  it("with an upcoming Cita the current layout is untouched (no direct scheduler)", () => {
    const view = buildMyAppointmentsView([appt("next", { startsAt: "2026-09-29T15:00:00.000Z", status: "confirmed" })], [], NOW);
    expect(view.nextAppointment?.id).toBe("next");
    expect(view.showDirectScheduler).toBe(false);
  });

  it("a pending NEW request → no usable scheduler (can't start another)", () => {
    const view = buildMyAppointmentsView([], [request()], NOW);
    expect(view.showDirectScheduler).toBe(false);
    expect(view.pendingRequest?.id).toBe("req-1");
  });

  it("reschedule requests — accepted, rejected or even pending — never block it", () => {
    for (const status of ["accepted", "rejected", "pending"] as const) {
      const view = buildMyAppointmentsView([], [request({ id: `rs-${status}`, kind: "reschedule", appointmentId: "old", status })], NOW);
      expect(view.showDirectScheduler).toBe(true);
    }
    expect(buildMyAppointmentsView([], [request({ status: "accepted" }), request({ id: "r2", status: "rejected" })], NOW).showDirectScheduler).toBe(true);
  });

  it("the screen renders the SAME real scheduler + historyPanel in that state, and the pending state keeps the disabled button", () => {
    const screen = fs.readFileSync(path.resolve(__dirname, "my-appointments-screen.tsx"), "utf8");
    const direct = screen.slice(screen.indexOf(") : showDirectScheduler ? ("), screen.indexOf("// No upcoming Cita but a NEW request is already pending"));
    expect(direct).toContain("<RequestAppointmentScheduler professionals={professionals} onSubmit={submitNewRequest} />");
    expect(direct).toContain("{historyPanel}");
    expect(screen).toContain('{showDirectScheduler ? "Agenda tu próxima cita con nosotros" : "Próxima cita"}');
    expect(screen).toContain("<ScheduleButton pending={Boolean(pendingRequest)} onClick={() => setScheduling(true)} primary />");
  });
});

describe("/portal/citas sources", () => {
  const dir = path.resolve(__dirname);
  const screen = fs.readFileSync(path.join(dir, "my-appointments-screen.tsx"), "utf8");

  it("'Agendar nueva cita' and 'Reprogramar' share the one real scheduler — no second picker", () => {
    expect(screen).toContain("<RequestAppointmentScheduler professionals={professionals} onSubmit={submitNewRequest} />");
    expect(screen).toContain('submitLabel="Solicitar reprogramación"');
    expect(screen).toContain("requestMyAppointment(professionalProfileId, preferredStartsAt)");
    expect(screen).toContain("requestMyAppointmentReschedule(appointment.id, professionalProfileId, preferredStartsAt)");
    expect(screen).toContain("Agendar nueva cita");
    expect(screen).toContain("Volver a Mis citas");
    expect(screen).not.toContain("RequestAppointmentModal");
    const scheduler = fs.readFileSync(path.join(dir, "request-appointment-scheduler.tsx"), "utf8");
    expect(scheduler).toContain("fetchMyProfessionalSchedule(");
    expect(scheduler).not.toContain("TIME_SLOTS");
  });

  it("Reprogramar/Cancelar render only behind the real eligibility rule; no invented fallbacks", () => {
    const code = screen.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    expect(code).toContain("const canChange = canPatientChangeAppointment(appointment);");
    expect(code).toMatch(/\{canChange && \(\s*<div className="grid grid-cols-2 gap-2">/);
    expect(code).not.toContain('"Odontología general"');
    expect(code).not.toContain('?? "Consulta"');
    expect(code).not.toContain("window.confirm");
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
