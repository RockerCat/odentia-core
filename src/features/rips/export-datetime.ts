// RIPS #5 — timezone-safe date helpers for the RIPS sin factura export.
// Pure, DB-free, no Node/browser timezone assumptions: every conversion
// goes through `Intl.DateTimeFormat`'s own `timeZone` option rather than
// hardcoded UTC-5 arithmetic (Colombia has no DST today, but this task's
// own instruction is explicit: no hardcodear conversiones inseguras).

export const RIPS_EXPORT_TIMEZONE = "America/Bogota";

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

// Reads the wall-clock date/time an ISO instant represents in `timeZone`,
// as plain numbers — the building block for both fechaInicioAtencion
// formatting and the round-trip period-boundary conversion below.
function zonedParts(isoInstant: string, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(isoInstant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // hour12: false can still render "24" for midnight in some engines —
  // normalize to the 0-23 range every DT1 consumer expects.
  const hour = get("hour") % 24;
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") };
}

// Documento Técnico 1 C02/P02 fechaInicioAtencion — "YYYY-MM-DD HH:MM"
// (16 chars exactly, per the field's own Tamaño), in the SEDE's local
// time, never the server's own timezone and never a bare UTC ISO string.
export function formatFechaInicioAtencion(isoInstant: string, timeZone: string = RIPS_EXPORT_TIMEZONE): string {
  const { year, month, day, hour, minute } = zonedParts(isoInstant, timeZone);
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
}

// Converts a local wall-clock date/time in `timeZone` to the UTC instant
// it represents — the standard "guess, measure the actual offset, correct"
// technique (safe for any timeZone, DST or not), used to compute a
// calendar month's [start, end) boundary in Colombia's own calendar rather
// than the server's.
function zonedWallClockToUtcIso(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): string {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const guessed = zonedParts(new Date(guessUtcMs).toISOString(), timeZone);
  const guessedAsUtcMs = Date.UTC(guessed.year, guessed.month - 1, guessed.day, guessed.hour, guessed.minute);
  const offsetMs = guessedAsUtcMs - guessUtcMs;
  return new Date(guessUtcMs - offsetMs).toISOString();
}

export type RipsExportPeriod = { year: number; month: number };

// [start, end) — end is exclusive (the first instant of the FOLLOWING
// month), so callers filter with `occurred_at >= start AND occurred_at <
// end`, never a closed range that could double-count a boundary instant.
export function getPeriodBoundsUtc(period: RipsExportPeriod, timeZone: string = RIPS_EXPORT_TIMEZONE): { startUtc: string; endUtc: string } {
  const startUtc = zonedWallClockToUtcIso(period.year, period.month, 1, 0, 0, timeZone);
  const nextMonthYear = period.month === 12 ? period.year + 1 : period.year;
  const nextMonth = period.month === 12 ? 1 : period.month + 1;
  const endUtc = zonedWallClockToUtcIso(nextMonthYear, nextMonth, 1, 0, 0, timeZone);
  return { startUtc, endUtc };
}

export function getPeriodLabel(period: RipsExportPeriod): string {
  const MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${MONTHS[period.month - 1]} de ${period.year}`;
}
