import { describe, expect, it } from "vitest";
import type { Appointment, AppointmentStatus } from "./appointments-data";
import {
  canStartClinicalEncounter,
  getDisplayStatus,
  getHistoryStatusBadgeClass,
  getStatusLabel,
  getStatusStyle,
  isTerminalStatus,
  isUnresolved,
  pickSlotAppointment,
  START_ENCOUNTER_WINDOW_MINUTES,
  UNRESOLVED_GRACE_MINUTES,
} from "./real-status";

// Regression coverage for CLAUDE.md's Appointment Lifecycle rule: a
// non-terminal Cita is never auto-completed/auto-cancelled/auto-marked
// "No asistió" just from time passing, but reads as the derived "Sin
// cerrar" display status once it's more than UNRESOLVED_GRACE_MINUTES past
// its scheduled end — whether it's stuck in_progress or never started at
// all. This is the single most load-bearing pure rule in the real Agenda
// feature (it drives Agenda's badges, the detail modal's CTAs, and every
// history list), so it's worth pinning down in a test that survives
// refactors of the surrounding UI.

type MinimalAppointment = Pick<Appointment, "status" | "startsAt" | "durationMinutes">;

const START = "2026-01-15T08:00:00.000Z"; // duration 30min -> endsAt 08:30:00Z
const DURATION = 30;

function apt(status: AppointmentStatus): MinimalAppointment {
  return { status, startsAt: START, durationMinutes: DURATION };
}

const ENDS_AT_MS = new Date("2026-01-15T08:30:00.000Z").getTime();

function minutesAfterEnd(minutes: number): Date {
  return new Date(ENDS_AT_MS + minutes * 60_000);
}

describe("isUnresolved", () => {
  const NON_TERMINAL: AppointmentStatus[] = ["scheduled", "confirmed", "patient_arrived", "waiting_room", "in_progress"];
  const TERMINAL: AppointmentStatus[] = ["completed", "no_show", "cancelled"];

  it("is never true before the grace period elapses, for any non-terminal status", () => {
    for (const status of NON_TERMINAL) {
      expect(isUnresolved(apt(status), minutesAfterEnd(UNRESOLVED_GRACE_MINUTES - 1))).toBe(false);
    }
  });

  it("is true once the grace period has fully elapsed, for any non-terminal status", () => {
    for (const status of NON_TERMINAL) {
      expect(isUnresolved(apt(status), minutesAfterEnd(UNRESOLVED_GRACE_MINUTES + 1))).toBe(true);
    }
  });

  it("is exactly at the boundary: not yet unresolved at the exact grace deadline", () => {
    expect(isUnresolved(apt("confirmed"), minutesAfterEnd(UNRESOLVED_GRACE_MINUTES))).toBe(false);
  });

  it("is never true for a terminal status, no matter how far past the deadline", () => {
    for (const status of TERMINAL) {
      expect(isUnresolved(apt(status), minutesAfterEnd(UNRESOLVED_GRACE_MINUTES * 100))).toBe(false);
    }
  });

  it("is never true for a future appointment", () => {
    expect(isUnresolved(apt("confirmed"), new Date("2026-01-15T07:00:00.000Z"))).toBe(false);
  });
});

describe("getDisplayStatus", () => {
  it("passes through the real status when not unresolved", () => {
    expect(getDisplayStatus(apt("confirmed"), minutesAfterEnd(0))).toBe("confirmed");
    expect(getDisplayStatus(apt("completed"), minutesAfterEnd(UNRESOLVED_GRACE_MINUTES * 10))).toBe("completed");
  });

  it("never returns completed/no_show/cancelled just because time passed", () => {
    // The core lifecycle guarantee: derivation can only ever produce
    // "unresolved" or the untouched real status — it can't fabricate a
    // terminal outcome.
    for (const status of ["scheduled", "confirmed", "in_progress"] as const) {
      const displayed = getDisplayStatus(apt(status), minutesAfterEnd(UNRESOLVED_GRACE_MINUTES * 10));
      expect(displayed).not.toBe("completed");
      expect(displayed).not.toBe("no_show");
      expect(displayed).not.toBe("cancelled");
      expect(displayed).toBe("unresolved");
    }
  });
});

// Regression coverage for "Iniciar/Continuar atención"'s single temporal
// rule — canStartClinicalEncounter (real-status.ts), reused as-is by both
// RealAppointmentDetailModal's CTA and the real /agenda/atencion/
// [appointmentId] route's server-side guard (see that route's own
// comment). Pure function of (appointment, now): role/professional-profile
// gating (Assistant, canAttendPatients) is a separate concern callers AND
// with this, never tested here.
describe("canStartClinicalEncounter", () => {
  // "Cita 8:00 AM" from the task's own QA table.
  const EIGHT_AM = "2026-01-15T08:00:00.000Z";
  const apt830 = (status: AppointmentStatus): MinimalAppointment => ({ status, startsAt: EIGHT_AM, durationMinutes: 30 });
  const at = (isoTime: string) => new Date(`2026-01-15T${isoTime}.000Z`);

  it("30 minutes before startsAt is the exact boundary", () => {
    expect(START_ENCOUNTER_WINDOW_MINUTES).toBe(30);
    expect(canStartClinicalEncounter(apt830("scheduled"), at("07:29:00"))).toBe(false);
    expect(canStartClinicalEncounter(apt830("scheduled"), at("07:30:00"))).toBe(true);
  });

  it("stays true through and after startsAt while still non-terminal", () => {
    expect(canStartClinicalEncounter(apt830("confirmed"), at("07:59:00"))).toBe(true);
    expect(canStartClinicalEncounter(apt830("confirmed"), at("08:00:00"))).toBe(true);
    expect(canStartClinicalEncounter(apt830("confirmed"), at("08:30:00"))).toBe(true);
  });

  it("stays true well after the appointment (10:30 AM for an 8:00 AM Cita), never-started and non-terminal — this is the \"Sin cerrar\" case", () => {
    // isUnresolved's own 120-minute grace period hasn't strictly elapsed
    // yet at exactly 10:30 for an 8:30 endsAt (see real-status.test.ts's
    // isUnresolved boundary test) — canStartClinicalEncounter has no such
    // grace window of its own and doesn't need isUnresolved to be true:
    // it's already been startable continuously since 7:30, "Sin cerrar" or
    // not.
    expect(canStartClinicalEncounter(apt830("confirmed"), at("10:30:00"))).toBe(true);
    // Confirmed separately, well past any grace period, that this is
    // exactly the "Sin cerrar, never started" case the task describes.
    const wellPast = at("11:00:00");
    expect(isUnresolved({ status: "confirmed", startsAt: EIGHT_AM, durationMinutes: 30 }, wellPast)).toBe(true);
    expect(canStartClinicalEncounter(apt830("confirmed"), wellPast)).toBe(true);
  });

  it("in_progress is always startable (\"Continuar atención\"), regardless of the time window", () => {
    expect(canStartClinicalEncounter(apt830("in_progress"), at("00:00:00"))).toBe(true);
    expect(canStartClinicalEncounter(apt830("in_progress"), at("23:59:00"))).toBe(true);
  });

  it("is never true for a terminal status, even inside the window or during the appointment", () => {
    for (const status of ["completed", "cancelled", "no_show"] as const) {
      expect(canStartClinicalEncounter(apt830(status), at("07:45:00"))).toBe(false);
      expect(canStartClinicalEncounter(apt830(status), at("08:15:00"))).toBe(false);
    }
  });

  it("more than 30 minutes before startsAt is never startable", () => {
    expect(canStartClinicalEncounter(apt830("scheduled"), at("07:00:00"))).toBe(false);
    expect(canStartClinicalEncounter(apt830("confirmed"), at("06:00:00"))).toBe(false);
  });

  describe("a date change (viewing across calendar days)", () => {
    const TOMORROW_EIGHT_AM = "2026-01-16T08:00:00.000Z";
    const aptTomorrow = (status: AppointmentStatus): MinimalAppointment => ({ status, startsAt: TOMORROW_EIGHT_AM, durationMinutes: 30 });

    it("a tomorrow appointment viewed today (even at the same clock time) is not startable", () => {
      expect(canStartClinicalEncounter(aptTomorrow("confirmed"), new Date("2026-01-15T07:45:00.000Z"))).toBe(false);
      expect(canStartClinicalEncounter(aptTomorrow("confirmed"), new Date("2026-01-15T08:00:00.000Z"))).toBe(false);
    });

    it("the same appointment, viewed tomorrow within its own window, is startable", () => {
      expect(canStartClinicalEncounter(aptTomorrow("confirmed"), new Date("2026-01-16T07:30:00.000Z"))).toBe(true);
      expect(canStartClinicalEncounter(aptTomorrow("confirmed"), new Date("2026-01-16T08:00:00.000Z"))).toBe(true);
    });
  });
});

describe("isTerminalStatus", () => {
  it("is true only for completed/no_show/cancelled", () => {
    for (const status of ["completed", "no_show", "cancelled"] as const) {
      expect(isTerminalStatus(status)).toBe(true);
    }
    for (const status of ["scheduled", "confirmed", "patient_arrived", "waiting_room", "in_progress"] as const) {
      expect(isTerminalStatus(status)).toBe(false);
    }
  });
});

// Regression coverage for the real reported bug: two Citas landing on the
// exact same professional+slot (nothing previously prevented this — see
// appointments-actions.ts's hasOverlappingAppointment, the actual fix for
// new bookings) made the Agenda grid's single-appointment-per-cell lookup
// pick whichever row came first in fetch order, with no regard for
// status — a stale `completed` row could silently win over a live
// `confirmed` one, making the real Cita unreachable and showing the wrong
// status entirely. pickSlotAppointment is the defensive display fallback:
// given every candidate appointment already known to occupy one visual
// slot, prefer a non-terminal one.
describe("pickSlotAppointment", () => {
  const withStatus = (status: AppointmentStatus) => ({ status });

  it("returns null for an empty slot", () => {
    expect(pickSlotAppointment([])).toBeNull();
  });

  it("returns the only candidate when there's no collision", () => {
    const only = withStatus("confirmed");
    expect(pickSlotAppointment([only])).toBe(only);
  });

  it("prefers a non-terminal candidate over a terminal one, regardless of order", () => {
    const completed = withStatus("completed");
    const confirmed = withStatus("confirmed");
    expect(pickSlotAppointment([completed, confirmed])).toBe(confirmed);
    expect(pickSlotAppointment([confirmed, completed])).toBe(confirmed);
  });

  it("in_progress counts as non-terminal — preferred over a completed collision", () => {
    const completed = withStatus("completed");
    const inProgress = withStatus("in_progress");
    expect(pickSlotAppointment([completed, inProgress])).toBe(inProgress);
  });

  it("falls back to the first candidate when every one is terminal", () => {
    const cancelled = withStatus("cancelled");
    const noShow = withStatus("no_show");
    expect(pickSlotAppointment([cancelled, noShow])).toBe(cancelled);
  });
});

describe("status label/style lookups", () => {
  it("returns Sin cerrar copy only for the derived unresolved value", () => {
    expect(getStatusLabel("unresolved")).toBe("Sin cerrar");
    expect(getStatusLabel("in_progress")).toBe("En curso");
    expect(getStatusLabel("no_show")).toBe("No asistió");
  });

  it("has a style/history-badge class for every real status plus unresolved", () => {
    const allStatuses: AppointmentStatus[] = [
      "scheduled",
      "confirmed",
      "patient_arrived",
      "waiting_room",
      "in_progress",
      "completed",
      "no_show",
      "cancelled",
    ];
    for (const status of [...allStatuses, "unresolved" as const]) {
      expect(getStatusStyle(status)).toBeTruthy();
      expect(getHistoryStatusBadgeClass(status)).toBeTruthy();
      expect(getStatusLabel(status)).toBeTruthy();
    }
  });
});
