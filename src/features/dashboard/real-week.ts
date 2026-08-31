// Real week-navigation date math for the real Agenda board — deliberately
// SEPARATE from appointments-card.tsx's buildWeekDaysForOffset/
// buildWeekLabelForOffset, which anchor "today" to a hardcoded reference
// Monday (August 3, 2026 — the one week WEEK_APPOINTMENTS models) and are
// still imported by the still-mock Patient Portal (my-appointments-screen.tsx)
// for its own "Reprogramar" week nav. Reusing/mutating that shared helper
// would change what the Patient Portal's still-mock reschedule flow shows —
// exactly the "never share a component between a converted real consumer
// and a still-mock one" rule from PROJECT_STATUS.md. This version anchors
// to the REAL current date (`new Date()`), since real appointments exist on
// real calendar dates, not just one modeled demo week.

export type WeekDay = {
  key: string; // "YYYY-MM-DD", used as both the react key and the query day boundary
  label: string;
  shortLabel: string;
  dateNumber: string;
  dateLabel: string;
  isToday: boolean;
};

const DAY_META = [
  { label: "Lunes", shortLabel: "Lun" },
  { label: "Martes", shortLabel: "Mar" },
  { label: "Miércoles", shortLabel: "Mié" },
  { label: "Jueves", shortLabel: "Jue" },
  { label: "Viernes", shortLabel: "Vie" },
  { label: "Sábado", shortLabel: "Sáb" },
  { label: "Domingo", shortLabel: "Dom" },
];

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isoDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Monday of the current real calendar week (getDay(): 0=Sunday..6=Saturday).
function currentWeekMonday(): Date {
  const today = new Date();
  const dow = today.getDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), diffToMonday);
}

function weekDaysStartingMonday(monday: Date): WeekDay[] {
  const today = new Date();
  return DAY_META.map((meta, i) => {
    const date = addDays(monday, i);
    return {
      key: isoDateKey(date),
      label: meta.label,
      shortLabel: meta.shortLabel,
      dateNumber: String(date.getDate()),
      dateLabel: `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`,
      isToday: isSameCalendarDay(date, today),
    };
  });
}

export function getWeekDaysForOffset(offset: number): WeekDay[] {
  return weekDaysStartingMonday(addDays(currentWeekMonday(), offset * 7));
}

// The 7 days of the week CONTAINING the given ISO instant — unlike
// getWeekDaysForOffset (always relative to today), this anchors to an
// arbitrary appointment's own date, so editing a "Fecha" field can offer
// that appointment's actual week even when it isn't the current real week
// (see real-appointment-detail-modal.tsx's Fecha editor).
export function getWeekDaysContaining(iso: string): WeekDay[] {
  const date = new Date(iso);
  const localMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = localMidnight.getDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return weekDaysStartingMonday(addDays(localMidnight, diffToMonday));
}

export function getWeekLabelForOffset(offset: number): string {
  const monday = addDays(currentWeekMonday(), offset * 7);
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()} – ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()]} ${sunday.getFullYear()}`;
  }
  return `${monday.getDate()} ${MONTH_NAMES[monday.getMonth()]} – ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()]} ${sunday.getFullYear()}`;
}

// [startIso, endIsoExclusive) — Monday 00:00 through the following Monday
// 00:00, local time, for a single fetchAppointmentsForRange call per week.
export function getWeekRangeIso(offset: number): { startIso: string; endIsoExclusive: string } {
  const monday = addDays(currentWeekMonday(), offset * 7);
  const nextMonday = addDays(monday, 7);
  return { startIso: monday.toISOString(), endIsoExclusive: nextMonday.toISOString() };
}

export function todayDateKey(): string {
  return isoDateKey(new Date());
}
