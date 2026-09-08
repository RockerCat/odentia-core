import { describe, expect, it } from "vitest";
import { canPatientConfirmAppointment } from "./appointment-eligibility";
import type { AppointmentStatus } from "@/features/dashboard/appointments-data";

// Regression coverage for "PROMPT NINJA — Patient Portal real: Confirmar
// asistencia" — this must mirror confirm_my_appointment's own eligibility
// check exactly: only a still-"scheduled" appointment that hasn't started
// yet is confirmable.

const NOW = new Date("2026-09-07T12:00:00.000Z");

const NON_ELIGIBLE_STATUSES: AppointmentStatus[] = [
  "confirmed",
  "patient_arrived",
  "waiting_room",
  "in_progress",
  "completed",
  "no_show",
  "cancelled",
];

describe("canPatientConfirmAppointment", () => {
  it("allows a future scheduled appointment", () => {
    expect(canPatientConfirmAppointment({ status: "scheduled", startsAt: "2026-09-10T12:00:00.000Z" }, NOW)).toBe(true);
  });

  it("allows an appointment starting exactly now (starts_at >= now)", () => {
    expect(canPatientConfirmAppointment({ status: "scheduled", startsAt: NOW.toISOString() }, NOW)).toBe(true);
  });

  it("rejects a past scheduled appointment (already occurred)", () => {
    expect(canPatientConfirmAppointment({ status: "scheduled", startsAt: "2026-09-01T12:00:00.000Z" }, NOW)).toBe(false);
  });

  it.each(NON_ELIGIBLE_STATUSES)("rejects a future appointment with status %s", (status) => {
    expect(canPatientConfirmAppointment({ status, startsAt: "2026-09-10T12:00:00.000Z" }, NOW)).toBe(false);
  });
});
