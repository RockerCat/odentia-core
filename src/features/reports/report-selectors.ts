import type { Dentist } from "@/features/dashboard/mock-data";
import type { Patient } from "@/features/patients/mock-data";
import { MS_PER_DAY, mostRecentMonday, TODAY, type DateRange, type ReportEncounter } from "./mock-data";

function inRange(date: Date, range: DateRange): boolean {
  return date.getTime() >= range.start.getTime() && date.getTime() <= range.end.getTime();
}

export function filterEncounters(
  encounters: ReportEncounter[],
  range: DateRange,
  dentistId: string, // "" = todos los profesionales
): ReportEncounter[] {
  return encounters.filter((e) => inRange(e.date, range) && (!dentistId || e.dentistId === dentistId));
}

export type ReportKpis = {
  scheduled: number;
  completed: number;
  attendanceRate: number; // 0-100
  noShow: number;
  cancelled: number;
  patientsAttended: number;
};

export function computeKpis(filtered: ReportEncounter[]): ReportKpis {
  const completed = filtered.filter((e) => e.status === "completed");
  const noShow = filtered.filter((e) => e.status === "no-show").length;
  const cancelled = filtered.filter((e) => e.status === "cancelled").length;
  const resolved = completed.length + noShow;
  return {
    scheduled: filtered.length,
    completed: completed.length,
    attendanceRate: resolved > 0 ? Math.round((completed.length / resolved) * 100) : 0,
    noShow,
    cancelled,
    patientsAttended: new Set(completed.map((e) => e.patientId)).size,
  };
}

export type ChartPoint = { label: string; value: number };

const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function bucketByWeek(items: ReportEncounter[], range: DateRange): ChartPoint[] {
  const buckets: { start: number; end: number; label: string; value: number }[] = [];
  for (let cursor = mostRecentMonday(range.start); cursor.getTime() <= range.end.getTime(); ) {
    const start = cursor.getTime();
    const end = start + 6 * MS_PER_DAY;
    buckets.push({ start, end, label: `${cursor.getDate()} ${MONTH_SHORT[cursor.getMonth()]}`, value: 0 });
    cursor = new Date(start + 7 * MS_PER_DAY);
  }
  for (const item of items) {
    const t = item.date.getTime();
    const bucket = buckets.find((b) => t >= b.start && t <= b.end);
    if (bucket) bucket.value += 1;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

function bucketByMonth(items: ReportEncounter[], range: DateRange): ChartPoint[] {
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
  for (const item of items) {
    const key = `${item.date.getFullYear()}-${item.date.getMonth()}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.value += 1;
  }
  return [...buckets.values()].sort((a, b) => a.sortKey - b.sortKey).map(({ label, value }) => ({ label, value }));
}

// Weekly buckets read fine up to ~6 weeks; anything longer switches to
// monthly so "Este año" doesn't render 52 slivers.
export function computeActivitySeries(filtered: ReportEncounter[], range: DateRange): ChartPoint[] {
  const spanDays = (range.end.getTime() - range.start.getTime()) / MS_PER_DAY;
  const completed = filtered.filter((e) => e.status === "completed");
  return spanDays <= 45 ? bucketByWeek(completed, range) : bucketByMonth(completed, range);
}

export type DentistActivityRow = {
  dentist: Dentist;
  atenciones: number;
  noShow: number;
  cancelled: number;
  patientsAttended: number;
};

export function computeDentistActivity(filtered: ReportEncounter[], dentists: Dentist[]): DentistActivityRow[] {
  return dentists.map((dentist) => {
    const rows = filtered.filter((e) => e.dentistId === dentist.id);
    const completed = rows.filter((e) => e.status === "completed");
    return {
      dentist,
      atenciones: completed.length,
      noShow: rows.filter((e) => e.status === "no-show").length,
      cancelled: rows.filter((e) => e.status === "cancelled").length,
      patientsAttended: new Set(completed.map((e) => e.patientId)).size,
    };
  });
}

export type TreatmentRankingRow = { treatment: string; count: number };

export function computeTreatmentRanking(filtered: ReportEncounter[], limit = 6): TreatmentRankingRow[] {
  const counts = new Map<string, number>();
  for (const e of filtered) {
    if (e.status !== "completed") continue;
    counts.set(e.treatment, (counts.get(e.treatment) ?? 0) + 1);
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

// Unlike the KPI row/table above, this reads from the FULL encounter
// history (not just the period-filtered slice): "primera visita",
// "última visita" and "próxima cita" are all standing facts about a
// patient, not something that should vanish just because their one visit
// falls outside the selected period.
export function computePatientsStats(
  allEncounters: ReportEncounter[],
  range: DateRange,
  dentistId: string,
  patients: Patient[],
): PatientsSectionStats {
  const scopedPatients = dentistId ? patients.filter((p) => p.usualDentistId === dentistId) : patients;
  const scopedEncounters = dentistId ? allEncounters.filter((e) => e.dentistId === dentistId) : allEncounters;
  const completed = scopedEncounters.filter((e) => e.status === "completed");

  const firstVisit = new Map<string, number>();
  const lastVisit = new Map<string, number>();
  for (const e of completed) {
    const t = e.date.getTime();
    if (firstVisit.get(e.patientId) === undefined || t < firstVisit.get(e.patientId)!) firstVisit.set(e.patientId, t);
    if (lastVisit.get(e.patientId) === undefined || t > lastVisit.get(e.patientId)!) lastVisit.set(e.patientId, t);
  }

  let newInPeriod = 0;
  for (const t of firstVisit.values()) {
    if (inRange(new Date(t), range)) newInPeriod += 1;
  }

  const inPeriodCounts = new Map<string, number>();
  for (const e of completed) {
    if (!inRange(e.date, range)) continue;
    inPeriodCounts.set(e.patientId, (inPeriodCounts.get(e.patientId) ?? 0) + 1);
  }
  const recurrent = [...inPeriodCounts.values()].filter((c) => c >= 2).length;

  const sixMonthsAgo = TODAY.getTime() - 182 * MS_PER_DAY;
  const staleOver6Months = scopedPatients.filter((p) => {
    const last = lastVisit.get(p.id);
    return last === undefined || last < sixMonthsAgo;
  }).length;

  const upcomingPatientIds = new Set(
    scopedEncounters
      .filter((e) => (e.status === "confirmed" || e.status === "pending") && e.date.getTime() > TODAY.getTime())
      .map((e) => e.patientId),
  );
  const withUpcoming = scopedPatients.filter((p) => upcomingPatientIds.has(p.id)).length;

  return {
    active: scopedPatients.filter((p) => p.status === "active").length,
    newInPeriod,
    recurrent,
    staleOver6Months,
    withUpcoming,
  };
}
