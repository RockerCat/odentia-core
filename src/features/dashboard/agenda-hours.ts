import { CLINIC_HOURS, formatSlotMinutes, INITIAL_PROFESSIONAL_SCHEDULE } from "./schedule-config";
import { isPastSlot } from "./real-format";

// Bug: "disponibilidad guardada hasta 22:00 pero Agenda sólo genera slots
// hasta 17:30" — real-appointments-board.tsx (and the create/reschedule/
// accept-request time pickers) always rendered schedule-config.ts's
// hardcoded CLINIC_HOURS (08:00–18:00) instead of the professional's real
// professional_availability. This module is the single source of truth
// for turning REAL availability rows into actual bookable slot minutes.
//
// SECOND PASS (this task) — the first fix computed a single continuous
// [earliest start, latest end] range and rounded it to whole hours. Both
// were wrong:
//   - two blocks the same day (e.g. 08:00–12:00 + 14:00–18:00, a lunch
//     split) must NOT produce a continuous 08:00–18:00 range — the gap
//     (12:00–13:30) must stay unavailable. Slots are generated PER BLOCK,
//     never from an envelope spanning every block.
//   - a block's own start/end is never snapped to a whole hour.
//     professional_availability.start_time/end_time is a plain Postgres
//     `time`, edited via <input type="time"> (horario-editor.tsx, no
//     `step` restricting it) — 08:30–17:30 must yield slots anchored at
//     08:30, stepping by the grid's own interval (30 min), stopping at
//     the LAST start whose own end still fits inside the block (17:00 —
//     never inventing 08:00, never extending past 17:30).

export type AgendaAvailabilityBlock = {
  professionalProfileId: string;
  dayOfWeek: number; // ISO 8601: 1=Lunes..7=Domingo — matches professional_availability.day_of_week exactly.
  startTime: string; // "HH:MM" or "HH:MM:SS" (24h)
  endTime: string;
  active: boolean;
};

function parseHourMinuteToMinutes(hhmm: string): number {
  const [hourStr, minuteStr] = hhmm.split(":");
  return Number(hourStr) * 60 + Number(minuteStr ?? 0);
}

// Matches appointments-actions.ts's own private isoWeekday exactly (JS
// Date#getDay() 0=Sun..6=Sat -> ISO 1=Mon..7=Sun) — duplicated rather than
// imported, same convention real-appointments-board.tsx's own
// slotToMinutes already follows for schedule-config.ts's private
// parseSlotToMinutes. Takes a "YYYY-MM-DD" day key (real-week.ts's
// WeekDay.key) parsed via local Date components — never `new
// Date(dayKey)` directly, which parses as UTC midnight and can shift a
// whole calendar day in a negative-UTC-offset clinic timezone (see
// real-format.ts's isPastDayKey, same convention).
export function isoWeekdayOfDayKey(dayKey: string): number {
  const [year, month, date] = dayKey.split("-").map(Number);
  const jsDay = new Date(year, month - 1, date).getDay();
  return ((jsDay + 6) % 7) + 1;
}

// ONE block → its own slot-start minutes, anchored at that block's own
// startTime (never at a global midnight-aligned grid). The last valid
// start is the latest one whose slot still ends at or before the block's
// endTime — this is what keeps 08:30–17:30 stopping at 17:00 (17:30 would
// end at 18:00, past the configured close) rather than either 17:30
// itself (an invalid, too-short slot) or being rounded up to 18:00.
function blockSlotMinutes(startTime: string, endTime: string, intervalMinutes: number): number[] {
  const start = parseHourMinuteToMinutes(startTime);
  const end = parseHourMinuteToMinutes(endTime);
  const minutes: number[] = [];
  for (let m = start; m + intervalMinutes <= end; m += intervalMinutes) {
    minutes.push(m);
  }
  return minutes;
}

const SLOT_INTERVAL_MINUTES = CLINIC_HOURS.intervalMinutes;

// Case A below, as its own predicate: ZERO availability rows of any kind
// (an all-inactive schedule is Case C, deliberately configured, never
// this). Every professional_profiles row now gets the initial schedule
// materialized as real rows at creation (and 20260924100000 backfilled
// every pre-existing zero-row profile), so this only happens if someone
// later deletes every block — Configuración then offers "Restaurar
// horario inicial" (horario-editor.tsx).
export function hasNoAvailabilityRows(professionalProfileId: string, availability: { professionalProfileId: string }[]): boolean {
  return !availability.some((b) => b.professionalProfileId === professionalProfileId);
}

// "Is this professional's schedule still exactly the untouched initial
// one?" — zero rows (Case A, same effective schedule), or exactly one
// active block per INITIAL_PROFESSIONAL_SCHEDULE day at its exact hours
// and nothing else. Drives Agenda's informative "Tu horario inicial está
// listo" notice (schedule-setup-alert.tsx): any real edit makes it false.
export function hasInitialSchedule(professionalProfileId: string, availability: AgendaAvailabilityBlock[]): boolean {
  const rows = availability.filter((b) => b.professionalProfileId === professionalProfileId);
  if (rows.length === 0) return true;
  const { daysOfWeek, startTime, endTime } = INITIAL_PROFESSIONAL_SCHEDULE;
  if (rows.length !== daysOfWeek.length) return false;
  const hhmm = (t: string) => t.slice(0, 5);
  return daysOfWeek.every((day) =>
    rows.some((b) => b.dayOfWeek === day && b.active && hhmm(b.startTime) === startTime && hhmm(b.endTime) === endTime),
  );
}

const WEEKDAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Human-readable form of INITIAL_PROFESSIONAL_SCHEDULE, derived from the
// constant itself, never a second hardcoded copy.
export function describeInitialSchedule(): string {
  const { daysOfWeek, startTime, endTime } = INITIAL_PROFESSIONAL_SCHEDULE;
  const first = WEEKDAY_NAMES[daysOfWeek[0] - 1];
  const last = WEEKDAY_NAMES[daysOfWeek[daysOfWeek.length - 1] - 1];
  const start = formatSlotMinutes(parseHourMinuteToMinutes(startTime));
  const end = formatSlotMinutes(parseHourMinuteToMinutes(endTime));
  return `${first} a ${last.toLowerCase()} · ${start} – ${end}`;
}

// FALLBACK SEMANTICS — mirrors appointments-actions.ts's own
// checkConfiguredAvailability three-way distinction, applied PER
// PROFESSIONAL, never clinic-wide:
//   - Case A: ZERO professional_availability rows AT ALL (any day) →
//     INITIAL_PROFESSIONAL_SCHEDULE (Lun–Vie 08:00–17:00; Sábado/Domingo
//     empty) — the same schedule a new profile gets as real rows, never
//     the old every-day CLINIC_HOURS range. The DB trigger
//     (validate_appointment_availability) stays permissive for zero rows;
//     this only narrows what Agenda offers.
//   - Case B: has at least one ACTIVE row for THIS exact day → real
//     configured blocks, used as-is (gaps preserved, no rounding).
//   - Case C: has rows configured (for this day, other days, or both) but
//     NONE active for THIS exact day → deliberately not working this
//     day — EMPTY, never falls back to the initial schedule.
function resolveSlotMinutesForProfessionalDay(input: {
  dayOfWeek: number;
  professionalProfileId: string;
  availability: AgendaAvailabilityBlock[];
}): number[] {
  if (hasNoAvailabilityRows(input.professionalProfileId, input.availability)) {
    const { daysOfWeek, startTime, endTime } = INITIAL_PROFESSIONAL_SCHEDULE;
    return (daysOfWeek as readonly number[]).includes(input.dayOfWeek) ? blockSlotMinutes(startTime, endTime, SLOT_INTERVAL_MINUTES) : []; // Case A
  }
  const professionalRows = input.availability.filter((b) => b.professionalProfileId === input.professionalProfileId);

  const activeToday = professionalRows.filter((b) => b.active && b.dayOfWeek === input.dayOfWeek);
  const minuteSet = new Set<number>();
  for (const block of activeToday) {
    for (const m of blockSlotMinutes(block.startTime, block.endTime, SLOT_INTERVAL_MINUTES)) {
      minuteSet.add(m); // Set — a bookable minute contributed by more than one (accidentally overlapping) block is never duplicated.
    }
  }
  return [...minuteSet]; // Case B (non-empty) or Case C (empty, by design — no fallback here)
}

// Real availability, scoped to every professional actually shown on the
// board, for one specific day → the real bookable slot-start minutes
// (sorted, deduped). Each shown professional is resolved independently
// (see resolveSlotMinutesForProfessionalDay) and the results are unioned
// — the board's shared single time-axis has to be wide enough for
// whichever displayed professional needs the most, but a professional
// with a real, narrower or day-off schedule is never falsely widened
// just because another shown professional has more/less configured.
export function resolveAgendaSlotMinutesForDay(input: {
  dayOfWeek: number;
  professionalProfileIds: string[];
  availability: AgendaAvailabilityBlock[];
}): number[] {
  const minuteSet = new Set<number>();
  for (const professionalProfileId of input.professionalProfileIds) {
    for (const m of resolveSlotMinutesForProfessionalDay({ dayOfWeek: input.dayOfWeek, professionalProfileId, availability: input.availability })) {
      minuteSet.add(m);
    }
  }
  return [...minuteSet].sort((a, b) => a - b);
}

// Same as resolveAgendaSlotMinutesForDay, formatted as the "H:MM AM/PM"
// labels every real Agenda picker already renders.
export function resolveAgendaSlotsForDay(input: {
  dayOfWeek: number;
  professionalProfileIds: string[];
  availability: AgendaAvailabilityBlock[];
}): string[] {
  return resolveAgendaSlotMinutesForDay(input).map(formatSlotMinutes);
}

// Merges already-occupied appointment slot-start minutes into a resolved
// list, formatted and sorted — an existing Cita must never become
// invisible on the board just because it now falls outside a since-
// narrowed/changed availability (e.g. it was booked under the old
// hardcoded 08:00–18:00 default, or before a lunch-split block was added
// later). This ONLY affects the board's own grid (which must still show
// every real appointment); it is never used to widen what a NEW
// appointment may pick — real-new-appointment-modal.tsx's own time
// picker still only ever offers resolveAgendaSlotsForDay's real slots.
export function mergeOccupiedSlotMinutes(slotMinutes: number[], occupiedMinutes: number[]): string[] {
  return [...new Set([...slotMinutes, ...occupiedMinutes])].sort((a, b) => a - b).map(formatSlotMinutes);
}

// "Does this day still have at least one FUTURE bookable slot?" — the
// per-professional/real-availability replacement for real-format.ts's own
// hasAvailableFutureSlot (which stays exactly as it was, hardcoded-
// TIME_SLOTS-based, for the ONE consumer that has no professional/
// availability context to give it — the Patient Portal's own "Solicitar
// cita", see request-appointment-scheduler.tsx and this task's own
// report). Reuses real-format.ts's own isPastSlot as the single source of
// truth for "is this specific slot already past" — never a second
// past/future comparison.
export function hasAvailableFutureSlotForDay(input: {
  dayKey: string;
  dayOfWeek: number;
  professionalProfileIds: string[];
  availability: AgendaAvailabilityBlock[];
}): boolean {
  const slots = resolveAgendaSlotsForDay(input);
  return slots.some((slot) => !isPastSlot(input.dayKey, slot));
}
