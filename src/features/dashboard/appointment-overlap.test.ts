import { describe, expect, it } from "vitest";
import { intervalsOverlap } from "./real-format";

// Regression coverage for "a professional cannot have two overlapping
// non-terminal Citas" (see appointments-actions.ts's hasOverlappingAppointment,
// which calls this same intervalsOverlap for every candidate row, and the
// appointments_no_overlap Postgres EXCLUDE constraint, which enforces the
// identical half-open-interval rule at the DB layer under concurrency —
// see that migration's own comment). This file pins down the interval
// math itself; it can't exercise the DB constraint (needs live Postgres —
// verified manually against the real remote project instead, see this
// task's own report) or the network-bound parts of
// hasOverlappingAppointment (status filter, ±1-day query window).

const EIGHT = "2026-01-15T08:00:00.000Z";
const EIGHT_FIFTEEN = "2026-01-15T08:15:00.000Z";
const EIGHT_THIRTY = "2026-01-15T08:30:00.000Z";
const SEVEN_THIRTY = "2026-01-15T07:30:00.000Z";

describe("intervalsOverlap", () => {
  it("rejects a later appointment starting before the first one ends (8:00–9:00 + 8:30–9:00)", () => {
    expect(intervalsOverlap(EIGHT, 60, EIGHT_THIRTY, 30)).toBe(true);
  });

  it("rejects one interval starting in the middle of another (8:00–8:30 + 8:15–8:45)", () => {
    expect(intervalsOverlap(EIGHT, 30, EIGHT_FIFTEEN, 30)).toBe(true);
  });

  it("rejects an earlier appointment ending after the next one starts (8:00–9:00 + 7:30–8:30)", () => {
    expect(intervalsOverlap(EIGHT, 60, SEVEN_THIRTY, 60)).toBe(true);
  });

  it("rejects the exact same startsAt", () => {
    expect(intervalsOverlap(EIGHT, 30, EIGHT, 30)).toBe(true);
  });

  it("rejects one appointment fully contained inside another (8:00–9:00 contains 8:15–8:45)", () => {
    expect(intervalsOverlap(EIGHT, 60, EIGHT_FIFTEEN, 30)).toBe(true);
    // Symmetric — order of arguments must not matter.
    expect(intervalsOverlap(EIGHT_FIFTEEN, 30, EIGHT, 60)).toBe(true);
  });

  it("allows two appointments that are exactly back-to-back (8:00–8:30 + 8:30–9:00)", () => {
    expect(intervalsOverlap(EIGHT, 30, EIGHT_THIRTY, 30)).toBe(false);
    expect(intervalsOverlap(EIGHT_THIRTY, 30, EIGHT, 30)).toBe(false);
  });

  it("allows two appointments with no proximity at all", () => {
    const nextDay = "2026-01-16T08:00:00.000Z";
    expect(intervalsOverlap(EIGHT, 30, nextDay, 30)).toBe(false);
  });
});
