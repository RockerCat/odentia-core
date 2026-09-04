// Small display-formatting helpers shared by the real Agenda components —
// the mock's Appointment carried pre-formatted `day`/`time` strings
// (mock-data.ts's WEEK_APPOINTMENTS); the real Appointment only carries a
// single ISO `startsAt` timestamptz, so these replace that formatting.
//
// Deliberately no "use client" here: toBoardProfessional is a plain data
// mapper (no hooks/DOM), and it's called from a Server Component
// (/agenda/atencion/[appointmentId]/page.tsx) as well as client ones —
// it used to live in real-appointments-board.tsx, which IS "use client",
// and Next.js's RSC boundary treats every export of a "use client" module
// as a client reference, not just its components — calling a plain
// function from that module server-side throws "Attempted to call X()
// from the server but X is on the client", regardless of the function's
// own body having no client-only dependency. Moved here instead of
// duplicated inline.

import type { ClinicalProfessional } from "./appointments-data";
import { TIME_SLOTS } from "./schedule-config";

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

// Calendar-day-only check: true once a day's OWN midnight is behind "now",
// regardless of the clinic's actual operating hours — today itself is
// never past here even seconds before midnight. Kept for what it is (a
// pure calendar comparison, covered by its own tests below) but no longer
// what date pickers use to decide if a day is selectable — see
// hasAvailableFutureSlot, which is.
export function isPastDayKey(dayKey: string): boolean {
  const [year, month, date] = dayKey.split("-").map(Number);
  const startOfDay = new Date(year, month - 1, date);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return startOfDay.getTime() < startOfToday.getTime();
}

// The single source of truth for "can this day still be picked" in every
// Agenda date picker (WeekDayPickerContent — Nueva cita, Reprogramar cita,
// and Agendar próxima cita, which reuses RealNewAppointmentModal
// unchanged): a day is selectable only if at least one of the clinic's
// fixed slots (schedule-config.ts's TIME_SLOTS) is still in the future for
// it, reusing isPastSlot itself rather than a second date comparison. This
// naturally covers all four cases isPastDayKey alone couldn't: a fully
// past day (every slot past) is disabled; a future day (every slot
// future) is enabled; "today" is enabled exactly while it still has a
// selectable slot, and disabled once the clinic's last slot for today has
// also passed (isPastDayKey alone always reads today as selectable, which
// is what let "jueves 3 sep, 5:25 PM" stay pickable with zero valid hours
// left).
export function hasAvailableFutureSlot(dayKey: string): boolean {
  return TIME_SLOTS.some((slot) => !isPastSlot(dayKey, slot));
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export type BoardProfessional = {
  professionalProfileId: string;
  name: string;
  initials: string;
  specialty: string;
  avatarUrl: string | null;
  defaultAppointmentDurationMinutes: number | null;
};

export function toBoardProfessional(p: ClinicalProfessional): BoardProfessional {
  const name = `${p.firstName} ${p.lastName}`.trim();
  return {
    professionalProfileId: p.professionalProfileId,
    name,
    initials: initialsOf(name),
    specialty: p.specialtyName ?? "Sin especialidad",
    avatarUrl: p.avatarUrl,
    defaultAppointmentDurationMinutes: p.defaultAppointmentDurationMinutes,
  };
}
