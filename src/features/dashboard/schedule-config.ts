// Centralized clinic operating hours for the agenda's time-slot grid.
// A single source of truth so the range never gets hardcoded per component.
// Later this can become a per-clinic setting instead of a fixed constant.

export type ClinicHours = {
  startHour: number; // 24h clock, inclusive
  endHour: number; // 24h clock, exclusive — the grid stops just before this
  intervalMinutes: number;
};

export const CLINIC_HOURS: ClinicHours = {
  startHour: 8, // 8:00 AM
  endHour: 18, // 6:00 PM
  intervalMinutes: 30,
};

// The initial professional schedule — Lunes–Viernes 08:00–17:00, Sábado/
// Domingo free. The canonical source is the SQL helper
// seed_default_professional_availability() (20260914090000), which
// materializes it as real, editable professional_availability rows for
// every new professional_profiles row (and, via 20260924100000, every
// pre-existing one that had zero rows). This mirrors it for the UI and for
// agenda-hours.ts's zero-rows fallback — schedule-config.test.ts fails if
// the two ever drift. Unrelated to CLINIC_HOURS above, which is only the
// generic time grid (slot interval, Portal request picker), never a
// professional's availability.
export const INITIAL_PROFESSIONAL_SCHEDULE = {
  daysOfWeek: [1, 2, 3, 4, 5], // ISO 8601: 1=Lunes..7=Domingo
  startTime: "08:00",
  endTime: "17:00",
} as const;

// Exported (was private) so agenda-hours.ts can format real
// professional_availability-derived minute values into the same "H:MM
// AM/PM" labels this grid has always used — those can land on ANY minute
// (an availability block's start/end time is a plain <input type="time">,
// see horario-editor.tsx, with no `step` restricting it to :00/:30), not
// just the :00/:30 values this function only ever received before. Fixed
// the zero-pad bug this exposed: `minute === 0 ? "00" : minute` rendered
// "9:7 AM" instead of "9:07 AM" for any single-digit minute — never
// reachable before (every past caller only ever fed :00/:30), reachable
// now.
export function formatSlotMinutes(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

// Parses a "H:MM AM/PM" slot label (as produced by formatSlot) back into
// minutes since midnight, so appointment durations can be added to a start
// time to derive an end time.
function parseSlotToMinutes(slot: string): number {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(slot);
  if (!match) return 0;
  const [, hourStr, minuteStr, period] = match;
  let hour = Number(hourStr) % 12;
  if (period === "PM") hour += 12;
  return hour * 60 + Number(minuteStr);
}

export function addMinutesToSlot(slot: string, minutesToAdd: number): string {
  return formatSlotMinutes(parseSlotToMinutes(slot) + minutesToAdd);
}

// Default appointment length when one hasn't been set explicitly.
export const DEFAULT_APPOINTMENT_DURATION = CLINIC_HOURS.intervalMinutes;

export function generateTimeSlots(hours: ClinicHours = CLINIC_HOURS): string[] {
  const slots: string[] = [];
  for (
    let minutes = hours.startHour * 60;
    minutes < hours.endHour * 60;
    minutes += hours.intervalMinutes
  ) {
    slots.push(formatSlotMinutes(minutes));
  }
  return slots;
}

export const TIME_SLOTS = generateTimeSlots();
