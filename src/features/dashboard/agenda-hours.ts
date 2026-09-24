import { CLINIC_HOURS, formatSlotMinutes, type ClinicHours } from "./schedule-config";
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

function fallbackSlotMinutes(fallback: ClinicHours): number[] {
  const minutes: number[] = [];
  for (let m = fallback.startHour * 60; m < fallback.endHour * 60; m += fallback.intervalMinutes) {
    minutes.push(m);
  }
  return minutes;
}

// Case A below, as its own predicate — "this professional never
// configured any schedule, so Agenda uses the default for her". Shared by
// the slot resolver itself, Agenda's onboarding alert, and Configuración's
// "Usando horario predeterminado" state, so all three agree on exactly
// what "not configured" means (zero rows of any kind — an all-inactive
// schedule is Case C, deliberately configured, never "default").
export function usesDefaultSchedule(professionalProfileId: string, availability: { professionalProfileId: string }[]): boolean {
  return !availability.some((b) => b.professionalProfileId === professionalProfileId);
}

// Human-readable form of the Case A default — CLINIC_HOURS, applied to
// every day of the week (fallbackSlotMinutes ignores dayOfWeek). Derived
// from the same constant the resolver uses, never a second hardcoded copy.
export function describeDefaultSchedule(fallback: ClinicHours = CLINIC_HOURS): string {
  return `Todos los días · ${formatSlotMinutes(fallback.startHour * 60)} – ${formatSlotMinutes(fallback.endHour * 60)}`;
}

// FALLBACK SEMANTICS (see this task's own report for the full
// explanation) — mirrors appointments-actions.ts's own
// checkConfiguredAvailability three-way distinction exactly, applied PER
// PROFESSIONAL, never clinic-wide:
//   - Case A: this professional has ZERO professional_availability rows
//     AT ALL (any day) → never configured a schedule — legacy
//     unrestricted, CLINIC_HOURS applies to EVERY day for them.
//   - Case B: has at least one ACTIVE row for THIS exact day → real
//     configured blocks, used as-is (gaps preserved, no rounding).
//   - Case C: has rows configured (for this day, other days, or both) but
//     NONE active for THIS exact day → deliberately not working this
//     day (e.g. "only Mon–Fri") — EMPTY, never falls back to
//     CLINIC_HOURS. A professional who configured Lun–Vie and left
//     Sábado alone must show ZERO slots on Sábado, not the 08:00–18:00
//     default — inventing availability they never configured would be
//     worse than showing none.
function resolveSlotMinutesForProfessionalDay(input: {
  dayOfWeek: number;
  professionalProfileId: string;
  availability: AgendaAvailabilityBlock[];
  fallback: ClinicHours;
}): number[] {
  if (usesDefaultSchedule(input.professionalProfileId, input.availability)) {
    return fallbackSlotMinutes(input.fallback); // Case A
  }
  const professionalRows = input.availability.filter((b) => b.professionalProfileId === input.professionalProfileId);

  const activeToday = professionalRows.filter((b) => b.active && b.dayOfWeek === input.dayOfWeek);
  const minuteSet = new Set<number>();
  for (const block of activeToday) {
    for (const m of blockSlotMinutes(block.startTime, block.endTime, input.fallback.intervalMinutes)) {
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
  fallback?: ClinicHours;
}): number[] {
  const fallback = input.fallback ?? CLINIC_HOURS;
  const minuteSet = new Set<number>();
  for (const professionalProfileId of input.professionalProfileIds) {
    for (const m of resolveSlotMinutesForProfessionalDay({ dayOfWeek: input.dayOfWeek, professionalProfileId, availability: input.availability, fallback })) {
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
  fallback?: ClinicHours;
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
  fallback?: ClinicHours;
}): boolean {
  const slots = resolveAgendaSlotsForDay(input);
  return slots.some((slot) => !isPastSlot(input.dayKey, slot));
}
