import { DENTISTS, TREATMENT_OPTIONS, type AppointmentStatus } from "@/features/dashboard/mock-data";
import { PATIENTS, type Patient } from "@/features/patients/mock-data";

export const MS_PER_DAY = 86_400_000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function mostRecentMonday(date: Date): Date {
  const day = date.getDay(); // 0 Sun … 6 Sat
  const sinceMonday = (day + 6) % 7;
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMonday));
}

// Frozen once at module load so every KPI/table/chart in Reportes reads a
// single, consistent "now" — a live-ticking Date() re-read per render could
// let a filter's boundary silently shift mid-session.
export const TODAY = startOfDay(new Date());

export type ReportPeriodKey = "this-month" | "last-month" | "last-3-months" | "this-year" | "custom";

export const REPORT_PERIOD_OPTIONS: { key: ReportPeriodKey; label: string }[] = [
  { key: "this-month", label: "Este mes" },
  { key: "last-month", label: "Mes anterior" },
  { key: "last-3-months", label: "Últimos 3 meses" },
  { key: "this-year", label: "Este año" },
  { key: "custom", label: "Personalizado" },
];

export type DateRange = { start: Date; end: Date };

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

// customRange lets "Personalizado" carry whatever the two date inputs
// currently hold — every other period is derived purely from TODAY, so the
// dashboard always reflects "now" without any extra state.
export function resolvePeriodRange(period: ReportPeriodKey, customRange?: DateRange): DateRange {
  switch (period) {
    case "this-month":
      return { start: startOfMonth(TODAY), end: endOfMonth(TODAY) };
    case "last-month": {
      const prevMonth = new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1);
      return { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) };
    }
    case "last-3-months":
      return { start: startOfMonth(new Date(TODAY.getFullYear(), TODAY.getMonth() - 2, 1)), end: endOfMonth(TODAY) };
    case "this-year":
      return { start: new Date(TODAY.getFullYear(), 0, 1), end: new Date(TODAY.getFullYear(), 11, 31, 23, 59, 59, 999) };
    case "custom":
      return customRange
        ? { start: startOfDay(customRange.start), end: endOfDay(customRange.end) }
        : { start: startOfMonth(TODAY), end: endOfMonth(TODAY) };
  }
}

export type ReportEncounterStatus = Extract<
  AppointmentStatus,
  "completed" | "no-show" | "cancelled" | "confirmed" | "pending"
>;

// A single scheduled slot (past or future) feeding every Reportes metric —
// deliberately its own record, not reused off Appointment/WEEK_APPOINTMENTS:
// those model one fixed demo week with day-of-week keys, not real calendar
// dates, so they can't support month/quarter/year filtering. Generated once
// below with a seeded PRNG (not Math.random) so server and client render
// the exact same data — this is a client-rendered screen, so a mismatch
// would otherwise trip a hydration error.
export type ReportEncounter = {
  id: string;
  date: Date;
  dentistId: string;
  patientId: string;
  treatment: string;
  status: ReportEncounterStatus;
};

function mulberry32(seed: number) {
  let state = seed;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateReportEncounters(): ReportEncounter[] {
  const random = mulberry32(20260819);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];

  const patientsByDentist = new Map<string, Patient[]>(
    DENTISTS.map((dentist) => [dentist.id, PATIENTS.filter((p) => p.usualDentistId === dentist.id)]),
  );

  const WEEKS_BACK = 60; // ~14 months of history — covers every fixed period option
  const WEEKS_FORWARD = 3; // a short runway of upcoming, unresolved appointments
  const currentWeekMonday = mostRecentMonday(TODAY);

  // Both already-inactive patients (see PATIENTS) go quiet for the most
  // recent half-year of generation — without this, the continuous weekly
  // generation below gives every patient *some* encounter often enough
  // that "Sin atención +6 meses"/"Con próxima cita" would never have
  // meaningful mock coverage (see task scope: filters must be evaluable).
  // They still have real older history, so they read as genuinely stale,
  // not as patients who never existed.
  const STALE_PATIENT_IDS = new Set(["p13", "p14"]);
  const STALE_CUTOFF_WEEKS = -26;

  // The flip side of the above: two otherwise-ordinary patients are held
  // OUT of every week before the current one, so nothing in the regular
  // loop below can backdate their history — without this, "Nuevos en el
  // período" would read 0 under every period option (continuous weekly
  // generation means everyone else's first visit falls ~14 months back).
  // A guaranteed completed visit is force-added for each right after the
  // loop (see below) rather than left to chance, since a purely random
  // pick landing inside "this month so far" isn't reliably likely on
  // every possible "today".
  const NEW_PATIENT_IDS = new Set(["p9", "p12"]);

  const encounters: ReportEncounter[] = [];
  let counter = 0;

  for (let week = -WEEKS_BACK; week <= WEEKS_FORWARD; week++) {
    const weekMonday = new Date(currentWeekMonday.getTime() + week * 7 * MS_PER_DAY);
    const excludeIds = new Set<string>();
    if (week >= STALE_CUTOFF_WEEKS) for (const id of STALE_PATIENT_IDS) excludeIds.add(id);
    if (week < 0) for (const id of NEW_PATIENT_IDS) excludeIds.add(id);

    for (const dentist of DENTISTS) {
      const count = 4 + Math.floor(random() * 4); // 4-7 encounters/week/dentist
      for (let i = 0; i < count; i++) {
        const dayOffset = Math.floor(random() * 6); // Monday(0) … Saturday(5), closed Sunday
        const date = new Date(weekMonday.getTime() + dayOffset * MS_PER_DAY);
        const isFuture = date.getTime() > TODAY.getTime();

        const usualPool = patientsByDentist.get(dentist.id) ?? [];
        const fallbackPool = PATIENTS.filter((p) => !excludeIds.has(p.id));
        const pool = (usualPool.length > 0 && random() < 0.85 ? usualPool : PATIENTS).filter(
          (p) => !excludeIds.has(p.id),
        );
        const patient = pick(pool.length > 0 ? pool : fallbackPool);

        let status: ReportEncounterStatus;
        if (isFuture) {
          status = random() < 0.65 ? "confirmed" : "pending";
        } else {
          const r = random();
          status = r < 0.78 ? "completed" : r < 0.9 ? "no-show" : "cancelled";
        }

        counter += 1;
        encounters.push({
          id: `renc-${counter}`,
          date,
          dentistId: dentist.id,
          patientId: patient.id,
          treatment: pick(TREATMENT_OPTIONS),
          status,
        });
      }
    }
  }

  for (const id of NEW_PATIENT_IDS) {
    const patient = PATIENTS.find((p) => p.id === id);
    if (!patient) continue;
    counter += 1;
    encounters.push({
      id: `renc-${counter}`,
      date: new Date(TODAY.getTime() - 2 * MS_PER_DAY),
      dentistId: patient.usualDentistId,
      patientId: patient.id,
      treatment: pick(TREATMENT_OPTIONS),
      status: "completed",
    });
  }

  return encounters;
}

export const REPORT_ENCOUNTERS: ReportEncounter[] = generateReportEncounters();
