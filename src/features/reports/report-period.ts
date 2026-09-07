// Real Reportes — period/date-range helpers. Ported from the old
// mock-data.ts (deleted — see task scope) with one change: `now` is a
// parameter instead of a frozen module-level constant, since this feature
// is now a real "use client" screen that fetches on every filter change
// (no SSR-hydration-mismatch concern the old frozen TODAY existed to avoid).

export const MS_PER_DAY = 86_400_000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function mostRecentMonday(date: Date): Date {
  const day = date.getDay(); // 0 Sun … 6 Sat
  const sinceMonday = (day + 6) % 7;
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMonday));
}

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
// currently hold — every other period is derived purely from `now`.
export function resolvePeriodRange(period: ReportPeriodKey, now: Date, customRange?: DateRange): DateRange {
  const today = startOfDay(now);
  switch (period) {
    case "this-month":
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case "last-month": {
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) };
    }
    case "last-3-months":
      return { start: startOfMonth(new Date(today.getFullYear(), today.getMonth() - 2, 1)), end: endOfMonth(today) };
    case "this-year":
      return { start: new Date(today.getFullYear(), 0, 1), end: new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999) };
    case "custom":
      return customRange
        ? { start: startOfDay(customRange.start), end: endOfDay(customRange.end) }
        : { start: startOfMonth(today), end: endOfMonth(today) };
  }
}
