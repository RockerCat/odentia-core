import type { Patient } from "@/features/patients/data";
import { isUnattendedSixMonths } from "@/features/patients/patient-kpis";
import { MS_PER_DAY, mostRecentMonday, type DateRange } from "./report-period";
import type { ReportAppointment, ReportEncounter, ReportProcedure, ReportProfessional } from "./reports-data";

// Real Reportes selectors — pure functions over already-fetched, already-
// scoped real rows (reports-data.ts). No mock entity here anymore: the old
// ReportEncounter conflated "cita" and "atención" into one synthetic
// record; the real model genuinely has two different sources for two
// different meanings (see each function's own comment for which).

export type ReportKpis = {
  scheduled: number;
  completed: number;
  attendanceRate: number; // 0-100
  noShow: number;
  cancelled: number;
  patientsAttended: number;
};

// "Citas programadas"/"No asistencias"/"Cancelaciones"/"Tasa de
// asistencia" read `appointments` — cita-level outcomes (rule: never infer
// completed from date/time, respect the real 8-value status as-is).
// "Atenciones completadas"/"Pacientes atendidos" read `finalizedEncounters`
// — actual clinical work performed (rule: encounters finalizados, not
// "citas pasadas"). These are deliberately two different real sources
// feeding the same KPI row — see reports-screen.tsx's own comment.
export function computeKpis(appointments: ReportAppointment[], finalizedEncounters: ReportEncounter[]): ReportKpis {
  const appointmentsCompleted = appointments.filter((a) => a.status === "completed").length;
  const noShow = appointments.filter((a) => a.status === "no_show").length;
  const cancelled = appointments.filter((a) => a.status === "cancelled").length;
  const resolved = appointmentsCompleted + noShow;
  return {
    scheduled: appointments.length,
    completed: finalizedEncounters.length,
    attendanceRate: resolved > 0 ? Math.round((appointmentsCompleted / resolved) * 100) : 0,
    noShow,
    cancelled,
    // Unique patients — "cada KPI debe contar entidades únicas cuando
    // semánticamente corresponda" (rule 5): a patient seen twice in the
    // period is still one patient, not two.
    patientsAttended: new Set(finalizedEncounters.map((e) => e.patientId)).size,
  };
}

export type ChartPoint = { label: string; value: number };

const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function bucketByWeek(dates: Date[], range: DateRange): ChartPoint[] {
  const buckets: { start: number; end: number; label: string; value: number }[] = [];
  for (let cursor = mostRecentMonday(range.start); cursor.getTime() <= range.end.getTime(); ) {
    const start = cursor.getTime();
    const end = start + 6 * MS_PER_DAY;
    buckets.push({ start, end, label: `${cursor.getDate()} ${MONTH_SHORT[cursor.getMonth()]}`, value: 0 });
    cursor = new Date(start + 7 * MS_PER_DAY);
  }
  for (const date of dates) {
    const t = date.getTime();
    const bucket = buckets.find((b) => t >= b.start && t <= b.end);
    if (bucket) bucket.value += 1;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

function bucketByMonth(dates: Date[], range: DateRange): ChartPoint[] {
  const buckets = new Map<string, ChartPoint & { sortKey: number }>();
  for (
    let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    cursor.getTime() <= range.end.getTime();
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    buckets.set(key, {
      label: `${MONTH_SHORT[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`,
      value: 0,
      sortKey: cursor.getTime(),
    });
  }
  for (const date of dates) {
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.value += 1;
  }
  return [...buckets.values()].sort((a, b) => a.sortKey - b.sortKey).map(({ label, value }) => ({ label, value }));
}

// "Actividad de la clínica"/"Mi actividad" — atenciones completadas
// (finalized encounters, same dataset as the KPI card above, same
// occurredAt field) through time. Weekly buckets read fine up to ~6 weeks;
// anything longer switches to monthly so "Este año" doesn't render 52
// slivers.
export function computeActivitySeries(finalizedEncounters: ReportEncounter[], range: DateRange): ChartPoint[] {
  const spanDays = (range.end.getTime() - range.start.getTime()) / MS_PER_DAY;
  const dates = finalizedEncounters.map((e) => e.occurredAt);
  return spanDays <= 45 ? bucketByWeek(dates, range) : bucketByMonth(dates, range);
}

export type DentistActivityRow = {
  professional: ReportProfessional;
  atenciones: number;
  noShow: number;
  cancelled: number;
  patientsAttended: number;
};

// "Actividad por profesional" — atenciones/pacientes atendidos come from
// finalized encounters keyed by attendedByProfileId (profiles.id); no
// asistió/canceladas come from appointments keyed by professionalProfileId.
// Two different keys because patient_clinical_encounters has no
// professional_profile_id column of its own (see reports-data.ts) —
// ReportProfessional carries both ids precisely so this can join across
// the two without a third query.
export function computeDentistActivity(
  professionals: ReportProfessional[],
  appointments: ReportAppointment[],
  finalizedEncounters: ReportEncounter[],
): DentistActivityRow[] {
  return professionals.map((professional) => {
    const citaRows = appointments.filter((a) => a.professionalProfileId === professional.id);
    const encounterRows = finalizedEncounters.filter((e) => e.attendedByProfileId === professional.profileId);
    return {
      professional,
      atenciones: encounterRows.length,
      noShow: citaRows.filter((a) => a.status === "no_show").length,
      cancelled: citaRows.filter((a) => a.status === "cancelled").length,
      patientsAttended: new Set(encounterRows.map((e) => e.patientId)).size,
    };
  });
}

export type TreatmentRankingRow = { treatment: string; count: number };

// "Procedimientos realizados" — patient_clinical_encounter_procedures rows
// for the already period-and-professional-scoped finalized encounters (see
// fetchProceduresForEncounters), never the treatments catalog or a
// treatment plan (rule 3, explicit).
export function computeTreatmentRanking(procedures: ReportProcedure[], limit = 6): TreatmentRankingRow[] {
  const counts = new Map<string, number>();
  for (const p of procedures) {
    counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([treatment, count]) => ({ treatment, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type PatientsSectionStats = {
  active: number;
  newInPeriod: number;
  recurrent: number;
  staleOver6Months: number;
  withUpcoming: number;
};

// Unlike the KPI row/table above, "primera visita"/"última visita"/
// "próxima cita" are all standing facts about a patient, not something
// that should vanish just because their one visit falls outside the
// selected period — allFinalizedEncounters/upcomingAppointments are both
// all-time (see reports-data.ts's own comment), never the period-filtered
// slice.
//
// scopedPatientIds: null when unscoped (Clinic Admin, "todos los
// profesionales" — clinic-wide, every real patient). Non-null when a
// single professional is in view (Dentist role, or Admin's own filter) —
// the set of patients that professional has an all-time finalized
// encounter with. This is a deliberate, disclosed redefinition of the old
// mock's "usualDentistId" static assignment: the real patients table has
// no dentist-assignment column at all (patients belong to the Clinic, per
// CLAUDE.md's Domain Model) — "belongs to this professional" can only be
// derived from who has actually treated them, never a static field. See
// this task's own final report for the explicit callout.
export function computePatientsStats(
  allFinalizedEncounters: ReportEncounter[],
  encountersInRange: ReportEncounter[],
  upcomingAppointments: ReportAppointment[],
  patients: Patient[],
  range: DateRange,
  scopedPatientIds: Set<string> | null,
  now: Date,
): PatientsSectionStats {
  const scopedPatients = scopedPatientIds ? patients.filter((p) => scopedPatientIds.has(p.id)) : patients;

  const firstVisit = new Map<string, number>();
  const lastVisit = new Map<string, number>();
  for (const e of allFinalizedEncounters) {
    const t = e.occurredAt.getTime();
    if (firstVisit.get(e.patientId) === undefined || t < firstVisit.get(e.patientId)!) firstVisit.set(e.patientId, t);
    if (lastVisit.get(e.patientId) === undefined || t > lastVisit.get(e.patientId)!) lastVisit.set(e.patientId, t);
  }

  let newInPeriod = 0;
  for (const t of firstVisit.values()) {
    if (t >= range.start.getTime() && t <= range.end.getTime()) newInPeriod += 1;
  }

  const inPeriodCounts = new Map<string, number>();
  for (const e of encountersInRange) {
    inPeriodCounts.set(e.patientId, (inPeriodCounts.get(e.patientId) ?? 0) + 1);
  }
  const recurrent = [...inPeriodCounts.values()].filter((c) => c >= 2).length;

  // Same definition already validated in /pacientes (patient-kpis.ts's own
  // isUnattendedSixMonths) — reused here instead of a second, divergent
  // one: a patient who never had a FINALIZED encounter at all is
  // deliberately EXCLUDED (not "stale", just never seen), and the 6-month
  // boundary is calendar-month subtraction, not a 182-day approximation
  // (the two can disagree by a few days depending on today's date).
  const staleOver6Months = scopedPatients.filter((p) => {
    const last = lastVisit.get(p.id);
    if (last === undefined) return false;
    return isUnattendedSixMonths(new Date(last).toISOString(), now);
  }).length;

  const upcomingPatientIds = new Set(upcomingAppointments.map((a) => a.patientId));
  const withUpcoming = scopedPatients.filter((p) => upcomingPatientIds.has(p.id)).length;

  return {
    active: scopedPatients.filter((p) => p.active).length,
    newInPeriod,
    recurrent,
    staleOver6Months,
    withUpcoming,
  };
}
