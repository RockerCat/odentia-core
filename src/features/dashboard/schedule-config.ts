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
