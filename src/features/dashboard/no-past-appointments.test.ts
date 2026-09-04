import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppointment, isPastInstant, PAST_DATE_ERROR, updateAppointment } from "./appointments-actions";
import { dateKeyOf, endTimeIso, hasAvailableFutureSlot, isPastDayKey, isPastSlot } from "./real-format";

// Regression coverage for "no past appointments, one rule, everywhere"
// (see appointments-actions.ts's own comment): the backend guard
// (isPastInstant, the actual source of truth on create/reschedule) and its
// UI-layer mirrors (isPastSlot/isPastDayKey, which disable — not just
// reject — a past choice) must agree on what counts as "past" relative to
// the same instant.

const NOW = new Date("2026-06-15T14:30:00.000Z"); // a Monday, mid-afternoon UTC

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isPastInstant (backend source of truth)", () => {
  it("rejects an instant before now", () => {
    expect(isPastInstant("2026-06-15T14:29:59.000Z")).toBe(true);
  });

  it("accepts an instant at or after now", () => {
    expect(isPastInstant("2026-06-15T14:30:00.000Z")).toBe(false);
    expect(isPastInstant("2026-06-15T14:30:01.000Z")).toBe(false);
    expect(isPastInstant("2026-12-01T00:00:00.000Z")).toBe(false);
  });
});

describe("dateKeyOf / endTimeIso", () => {
  it("derives the local calendar-day key from an ISO instant", () => {
    expect(dateKeyOf("2026-06-15T14:30:00.000Z")).toBe(dateKeyOf(NOW.toISOString()));
  });

  it("adds duration minutes to get the appointment's end instant", () => {
    expect(endTimeIso("2026-06-15T08:00:00.000Z", 30)).toBe("2026-06-15T08:30:00.000Z");
    expect(endTimeIso("2026-06-15T08:00:00.000Z", 90)).toBe("2026-06-15T09:30:00.000Z");
  });
});

describe("isPastSlot (calendar-day + time-of-day, UI slot grid/pickers)", () => {
  // NOW is 2026-06-15T14:30:00.000Z — 09:30 local in this test environment's
  // UTC-5 fixture-equivalent offset is irrelevant here since slotDateTime
  // builds a LOCAL Date and isPastSlot compares it against Date.now(), so
  // this holds regardless of the machine's own timezone.
  it("today + an hour already past = disabled (true)", () => {
    const past = new Date(NOW);
    past.setHours(past.getHours() - 1);
    const hour12 = ((past.getHours() + 11) % 12) + 1;
    const slot = `${hour12}:${String(past.getMinutes()).padStart(2, "0")} ${past.getHours() >= 12 ? "PM" : "AM"}`;
    expect(isPastSlot(dateKeyOf(NOW.toISOString()), slot)).toBe(true);
  });

  it("today + the next future hour = enabled (false)", () => {
    const future = new Date(NOW);
    future.setHours(future.getHours() + 1);
    const hour12 = ((future.getHours() + 11) % 12) + 1;
    const slot = `${hour12}:${String(future.getMinutes()).padStart(2, "0")} ${future.getHours() >= 12 ? "PM" : "AM"}`;
    expect(isPastSlot(dateKeyOf(NOW.toISOString()), slot)).toBe(false);
  });

  it("a past day's slot is past regardless of time", () => {
    const yesterday = new Date(NOW);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isPastSlot(dateKeyOf(yesterday.toISOString()), "11:59 PM")).toBe(true);
  });

  it("a future day's slot is never past regardless of time", () => {
    const tomorrow = new Date(NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isPastSlot(dateKeyOf(tomorrow.toISOString()), "8:00 AM")).toBe(false);
  });
});

describe("isPastDayKey (calendar-day-only, UI date picker)", () => {
  it("today itself is never past, even this late in the day", () => {
    expect(isPastDayKey(dateKeyOf(NOW.toISOString()))).toBe(false);
  });

  it("yesterday is past", () => {
    const yesterday = new Date(NOW);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isPastDayKey(dateKeyOf(yesterday.toISOString()))).toBe(true);
  });

  it("tomorrow is not past", () => {
    const tomorrow = new Date(NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isPastDayKey(dateKeyOf(tomorrow.toISOString()))).toBe(false);
  });
});

// hasAvailableFutureSlot is the single source of truth date pickers
// (WeekDayPickerContent — Nueva cita, Reprogramar cita, and Agendar
// próxima cita, which reuses RealNewAppointmentModal unchanged) use to
// decide whether a day is selectable at all — isPastDayKey alone still
// reads "today" as selectable with zero clinic hours left, which is
// exactly the reported regression (jueves 3 sep, 5:25 PM, every slot
// already past).
describe("hasAvailableFutureSlot (single source of truth for date pickers)", () => {
  it("a past day has no available future slot = disabled", () => {
    const yesterday = new Date(NOW);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(hasAvailableFutureSlot(dateKeyOf(yesterday.toISOString()))).toBe(false);
  });

  it("a future day always has an available future slot = enabled", () => {
    const tomorrow = new Date(NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(hasAvailableFutureSlot(dateKeyOf(tomorrow.toISOString()))).toBe(true);
  });

  it("today has an available future slot while clinic hours remain = enabled", () => {
    expect(hasAvailableFutureSlot(dateKeyOf(NOW.toISOString()))).toBe(true);
  });

  it("today has NO available future slot once every clinic slot has passed = disabled (the reported 5:25 PM repro)", () => {
    const afterClosing = new Date(NOW);
    afterClosing.setHours(23, 0, 0, 0); // well past the clinic's last 5:30 PM slot, same calendar day
    vi.setSystemTime(afterClosing);
    expect(hasAvailableFutureSlot(dateKeyOf(afterClosing.toISOString()))).toBe(false);
  });
});

// createAppointment/updateAppointment check isPastInstant as their very
// first statement, before ever calling createClient() — so these reject
// and return without touching Supabase, safe to call directly here with
// no client mocking. This is what backs "Nueva cita", "Reprogramar cita",
// and "Agendar próxima cita" (all three go through these two functions,
// never a separate write path) — see appointments-actions.ts's own
// comment on this being the single source of truth.
describe("createAppointment / updateAppointment reject a past starts_at", () => {
  const pastInput = {
    clinicId: "clinic-1",
    patientId: "patient-1",
    patientName: "Test Patient",
    patientPhone: null,
    professionalProfileId: "prof-1",
    startsAt: "2026-06-15T14:29:59.000Z",
    durationMinutes: 30,
    reason: null,
    room: null,
    contactPhone: null,
    notes: null,
  };

  it("createAppointment rejects a past startsAt with PAST_DATE_ERROR and never reaches Supabase", async () => {
    const result = await createAppointment(pastInput);
    expect(result).toEqual({ status: "error", message: PAST_DATE_ERROR });
  });

  it("updateAppointment (reschedule) rejects a past startsAt with PAST_DATE_ERROR and never reaches Supabase", async () => {
    const result = await updateAppointment("appointment-1", { startsAt: "2026-06-15T14:29:59.000Z" });
    expect(result).toEqual({ status: "error", message: PAST_DATE_ERROR });
  });
});
