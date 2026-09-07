import { describe, expect, it } from "vitest";
import type { Patient } from "@/features/patients/data";
import type { DateRange } from "./report-period";
import { computeDentistActivity, computeKpis, computePatientsStats, computeTreatmentRanking } from "./report-selectors";
import type { ReportAppointment, ReportEncounter, ReportProcedure, ReportProfessional } from "./reports-data";

// Regression coverage for "PROMPT NINJA — Reportes reales": every rule the
// task states explicitly (completed/cancelled/no_show respected as-is,
// draft encounters never count, finalized ones do, procedures aggregate
// from real records, unique-patient counting, correct per-professional
// attribution). These are pure functions over already-fetched rows — the
// live Supabase queries themselves (RLS/clinic isolation) were verified
// manually against the real remote project (see this task's own report),
// same split as appointment-overlap.test.ts.

function appt(overrides: Partial<ReportAppointment> = {}): ReportAppointment {
  return {
    id: "a1",
    professionalProfileId: "prof-1",
    patientId: "pat-1",
    startsAt: new Date("2026-06-10T14:00:00.000Z"),
    status: "confirmed",
    ...overrides,
  };
}

function encounter(overrides: Partial<ReportEncounter> = {}): ReportEncounter {
  return {
    id: "e1",
    patientId: "pat-1",
    attendedByProfileId: "profile-1",
    occurredAt: new Date("2026-06-10T14:30:00.000Z"),
    ...overrides,
  };
}

const JUNE: DateRange = { start: new Date("2026-06-01T00:00:00"), end: new Date("2026-06-30T23:59:59") };

describe("computeKpis", () => {
  it("counts every appointment status toward 'Citas programadas' regardless of outcome", () => {
    const appointments = [
      appt({ id: "1", status: "confirmed" }),
      appt({ id: "2", status: "completed" }),
      appt({ id: "3", status: "cancelled" }),
      appt({ id: "4", status: "no_show" }),
    ];
    expect(computeKpis(appointments, []).scheduled).toBe(4);
  });

  it("counts cancelled and no_show separately, never as an atención realizada", () => {
    const appointments = [
      appt({ id: "1", status: "cancelled" }),
      appt({ id: "2", status: "no_show" }),
      appt({ id: "3", status: "completed" }),
    ];
    const kpis = computeKpis(appointments, []);
    expect(kpis.cancelled).toBe(1);
    expect(kpis.noShow).toBe(1);
    // completed (Atenciones completadas) reads from finalized encounters,
    // not from appointment.status — zero encounters passed here, so zero,
    // even though one appointment is 'completed'.
    expect(kpis.completed).toBe(0);
  });

  it("'Atenciones completadas' counts finalized encounters, not appointment status", () => {
    const appointments = [appt({ status: "confirmed" })]; // no appointment is 'completed'
    const encounters = [encounter(), encounter({ id: "e2", patientId: "pat-2" })];
    expect(computeKpis(appointments, encounters).completed).toBe(2);
  });

  it("attendance rate derives from appointment completed/no_show only", () => {
    const appointments = [
      appt({ id: "1", status: "completed" }),
      appt({ id: "2", status: "completed" }),
      appt({ id: "3", status: "completed" }),
      appt({ id: "4", status: "no_show" }),
    ];
    expect(computeKpis(appointments, []).attendanceRate).toBe(75);
  });

  it("attendance rate is 0 (not NaN/Infinity) when nothing is resolved yet", () => {
    const appointments = [appt({ status: "confirmed" })];
    expect(computeKpis(appointments, []).attendanceRate).toBe(0);
  });

  it("counts unique patients, not encounter rows, for 'Pacientes atendidos'", () => {
    const encounters = [
      encounter({ id: "e1", patientId: "pat-1" }),
      encounter({ id: "e2", patientId: "pat-1" }), // same patient, second visit
      encounter({ id: "e3", patientId: "pat-2" }),
    ];
    expect(computeKpis([], encounters).patientsAttended).toBe(2);
  });

  it("empty period produces honest zeros, never fabricated values", () => {
    const kpis = computeKpis([], []);
    expect(kpis).toEqual({ scheduled: 0, completed: 0, attendanceRate: 0, noShow: 0, cancelled: 0, patientsAttended: 0 });
  });
});

describe("computeDentistActivity", () => {
  const professionals: ReportProfessional[] = [
    { id: "prof-1", profileId: "profile-1", name: "Dra. A", initials: "A", specialty: "Odontología" },
    { id: "prof-2", profileId: "profile-2", name: "Dr. B", initials: "B", specialty: "Ortodoncia" },
  ];

  it("attributes each professional's own atenciones/citas only, never mixing rows", () => {
    const appointments = [
      appt({ id: "1", professionalProfileId: "prof-1", status: "no_show" }),
      appt({ id: "2", professionalProfileId: "prof-2", status: "cancelled" }),
    ];
    const encounters = [
      encounter({ id: "e1", attendedByProfileId: "profile-1", patientId: "pat-1" }),
      encounter({ id: "e2", attendedByProfileId: "profile-2", patientId: "pat-2" }),
      encounter({ id: "e3", attendedByProfileId: "profile-2", patientId: "pat-2" }), // same patient again
    ];
    const rows = computeDentistActivity(professionals, appointments, encounters);

    const rowA = rows.find((r) => r.professional.id === "prof-1")!;
    expect(rowA.noShow).toBe(1);
    expect(rowA.cancelled).toBe(0);
    expect(rowA.atenciones).toBe(1);
    expect(rowA.patientsAttended).toBe(1);

    const rowB = rows.find((r) => r.professional.id === "prof-2")!;
    expect(rowB.noShow).toBe(0);
    expect(rowB.cancelled).toBe(1);
    expect(rowB.atenciones).toBe(2);
    // Two encounters, same patient — unique count is 1.
    expect(rowB.patientsAttended).toBe(1);
  });
});

describe("computeTreatmentRanking", () => {
  it("aggregates real procedure names, ranked by frequency", () => {
    const procedures: ReportProcedure[] = [
      { encounterId: "e1", name: "Limpieza dental" },
      { encounterId: "e1", name: "Resina compuesta" },
      { encounterId: "e2", name: "Limpieza dental" },
      { encounterId: "e3", name: "Limpieza dental" },
    ];
    const ranking = computeTreatmentRanking(procedures);
    expect(ranking[0]).toEqual({ treatment: "Limpieza dental", count: 3 });
    expect(ranking[1]).toEqual({ treatment: "Resina compuesta", count: 1 });
  });

  it("returns empty when no procedures were passed (e.g. zero finalized encounters this period)", () => {
    expect(computeTreatmentRanking([])).toEqual([]);
  });
});

describe("computePatientsStats", () => {
  const patients: Patient[] = [
    { id: "pat-1", firstName: "A", lastName: "A", documentId: null, phone: null, email: null, birthDate: null, active: true, createdAt: "2026-01-01" },
    { id: "pat-2", firstName: "B", lastName: "B", documentId: null, phone: null, email: null, birthDate: null, active: true, createdAt: "2026-01-01" },
    { id: "pat-3", firstName: "C", lastName: "C", documentId: null, phone: null, email: null, birthDate: null, active: false, createdAt: "2026-01-01" },
  ];
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("counts a patient as recurrent only with >=2 finalized encounters inside the period", () => {
    const inRange = [
      encounter({ id: "e1", patientId: "pat-1", occurredAt: new Date("2026-06-05T10:00:00Z") }),
      encounter({ id: "e2", patientId: "pat-1", occurredAt: new Date("2026-06-10T10:00:00Z") }),
      encounter({ id: "e3", patientId: "pat-2", occurredAt: new Date("2026-06-10T10:00:00Z") }),
    ];
    const stats = computePatientsStats(inRange, inRange, [], patients, JUNE, null, now);
    expect(stats.recurrent).toBe(1);
  });

  it("marks a patient stale only when their last finalized encounter is more than 6 calendar months before now (same rule as /pacientes' isUnattendedSixMonths)", () => {
    const allTime = [
      encounter({ id: "e1", patientId: "pat-1", occurredAt: new Date("2025-01-01T10:00:00Z") }), // stale
      encounter({ id: "e2", patientId: "pat-2", occurredAt: new Date("2026-06-01T10:00:00Z") }), // recent
      // pat-3 has no finalized encounter at all, ever — must be EXCLUDED,
      // never counted as stale (unified with /pacientes: "sin atención
      // +6 meses" means "was attended, then went quiet," not "never
      // attended at all").
    ];
    const stats = computePatientsStats(allTime, [], [], patients, JUNE, null, now);
    expect(stats.staleOver6Months).toBe(1);
  });

  it("never counts a patient with zero finalized encounters as stale, even alongside others who are", () => {
    const allTime = [encounter({ id: "e1", patientId: "pat-1", occurredAt: new Date("2020-01-01T10:00:00Z") })];
    // pat-2 and pat-3 both have no encounters at all.
    const stats = computePatientsStats(allTime, [], [], patients, JUNE, null, now);
    expect(stats.staleOver6Months).toBe(1);
  });

  it("matches /pacientes' exact 6-calendar-month boundary (inclusive) via the same shared helper", () => {
    const exactlySixMonthsAgo = new Date(now);
    exactlySixMonthsAgo.setMonth(exactlySixMonthsAgo.getMonth() - 6);
    const oneDayShort = new Date(exactlySixMonthsAgo.getTime() + 24 * 60 * 60 * 1000);

    const atBoundary = computePatientsStats(
      [encounter({ id: "e1", patientId: "pat-1", occurredAt: exactlySixMonthsAgo })],
      [],
      [],
      patients,
      JUNE,
      null,
      now,
    );
    expect(atBoundary.staleOver6Months).toBe(1);

    const justUnderBoundary = computePatientsStats(
      [encounter({ id: "e1", patientId: "pat-1", occurredAt: oneDayShort })],
      [],
      [],
      patients,
      JUNE,
      null,
      now,
    );
    expect(justUnderBoundary.staleOver6Months).toBe(0);
  });

  it("scopes 'Activos'/'Atendidos' to only the patients a specific professional has treated", () => {
    const allTime = [encounter({ id: "e1", patientId: "pat-1" })];
    const scopedPatientIds = new Set(["pat-1"]);
    const stats = computePatientsStats(allTime, [], [], patients, JUNE, scopedPatientIds, now);
    // Only pat-1 is in scope, and it's active — 1, not 2 (pat-2 is active
    // too but was never treated by this professional).
    expect(stats.active).toBe(1);
  });

  it("empty period/no history yields honest zeros, never fabricated values", () => {
    const stats = computePatientsStats([], [], [], [], JUNE, null, now);
    expect(stats).toEqual({ active: 0, newInPeriod: 0, recurrent: 0, staleOver6Months: 0, withUpcoming: 0 });
  });
});
