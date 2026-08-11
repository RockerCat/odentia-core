// Professional titles ("Dra. Camila Vargas") aren't a first name — skip
// them so greetings/short labels read "Camila", not "Dra.".
const TITLE_PREFIXES = new Set(["dr.", "dra.", "dr", "dra"]);

export function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? "";
  if (TITLE_PREFIXES.has(first.toLowerCase()) && parts.length > 1) {
    return parts[1];
  }
  return first;
}

// "8:03 AM" style clock label — shared by any live-timer/countdown UI
// (clinical encounter screen, the Assistant's operational timer in the
// appointment detail modal) so they render timestamps identically.
export function formatClockLabel(date: Date): string {
  const hour24 = date.getHours();
  const minute = date.getMinutes();
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// "01:23:45" elapsed-duration label — same rationale as formatClockLabel.
export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}
