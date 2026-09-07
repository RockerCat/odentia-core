import { describe, expect, it } from "vitest";
import { isUnattendedSixMonths, UNATTENDED_MONTHS_THRESHOLD } from "./patient-kpis";

// Regression coverage for /pacientes' "Sin atención +6 meses" KPI — the
// one piece of its logic that's a real date-threshold rule worth pinning
// down independent of any Supabase call (see patient-kpis.ts's own
// fetchPatientKpis, which is the thin, untested-here data-fetching layer
// around this pure function — same split as real-status.ts's
// isUnresolved/real-status.test.ts).

const NOW = new Date("2026-09-07T12:00:00.000Z");

function monthsBefore(now: Date, months: number, extraMs = 0): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return new Date(d.getTime() + extraMs).toISOString();
}

describe("isUnattendedSixMonths", () => {
  it("counts an encounter well over 6 months old", () => {
    expect(isUnattendedSixMonths(monthsBefore(NOW, 7), NOW)).toBe(true);
  });

  it("does not count a recent encounter", () => {
    expect(isUnattendedSixMonths(monthsBefore(NOW, 1), NOW)).toBe(false);
  });

  it("does not count an encounter from today", () => {
    expect(isUnattendedSixMonths(NOW.toISOString(), NOW)).toBe(false);
  });

  it("counts exactly at the 6-month boundary (inclusive)", () => {
    expect(isUnattendedSixMonths(monthsBefore(NOW, UNATTENDED_MONTHS_THRESHOLD), NOW)).toBe(true);
  });

  it("does not count one millisecond short of the 6-month boundary", () => {
    expect(isUnattendedSixMonths(monthsBefore(NOW, UNATTENDED_MONTHS_THRESHOLD, 1), NOW)).toBe(false);
  });

  it("counts one millisecond past the 6-month boundary", () => {
    expect(isUnattendedSixMonths(monthsBefore(NOW, UNATTENDED_MONTHS_THRESHOLD, -1), NOW)).toBe(true);
  });
});
