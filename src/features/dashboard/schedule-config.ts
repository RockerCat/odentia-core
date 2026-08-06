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

function formatSlot(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute === 0 ? "00" : minute} ${period}`;
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
  return formatSlot(parseSlotToMinutes(slot) + minutesToAdd);
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
    slots.push(formatSlot(minutes));
  }
  return slots;
}

export const TIME_SLOTS = generateTimeSlots();
