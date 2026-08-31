// Small display-formatting helpers shared by the real Agenda components —
// the mock's Appointment carried pre-formatted `day`/`time` strings
// (mock-data.ts's WEEK_APPOINTMENTS); the real Appointment only carries a
// single ISO `startsAt` timestamptz, so these replace that formatting.

const TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });
const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });

// Matches schedule-config.ts's formatSlot output shape ("8:00 AM") closely
// enough for display — case differences in AM/PM from Intl are normalized.
export function formatTimeLabel(iso: string): string {
  return TIME_FORMATTER.format(new Date(iso)).toUpperCase().replace("A. M.", "AM").replace("P. M.", "PM").replace(/\s+/g, " ");
}

export function formatDateLabel(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso)).replace(".", "");
}

export function endTimeIso(startsAtIso: string, durationMinutes: number): string {
  return new Date(new Date(startsAtIso).getTime() + durationMinutes * 60000).toISOString();
}

export function dateKeyOf(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parses a "H:MM AM/PM" slot label (matches schedule-config.ts's own
// formatSlot output) combined with a "YYYY-MM-DD" day key (see
// real-week.ts's WeekDay.key) into a concrete local Date instant.
function slotDateTime(dayKey: string, slot: string): Date {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(slot);
  const [yearStr, monthStr, dateStr] = dayKey.split("-");
  let hour = match ? Number(match[1]) % 12 : 0;
  const minute = match ? Number(match[2]) : 0;
  if (match?.[3] === "PM") hour += 12;
  return new Date(Number(yearStr), Number(monthStr) - 1, Number(dateStr), hour, minute);
}

// Real date + real time comparison (not just the calendar day) — a slot
// earlier today is past even though "today" itself isn't.
export function isPastSlot(dayKey: string, slot: string): boolean {
  return slotDateTime(dayKey, slot).getTime() < Date.now();
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}
