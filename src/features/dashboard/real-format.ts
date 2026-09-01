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

// Calendar-day-only check for date pickers (WeekDayPickerContent), which
// select a day with no time attached yet — today itself is never past here
// even seconds before midnight; individual slots within today are what
// isPastSlot above disables. The single real "no past appointments" rule
// this codebase enforces (see appointments-actions.ts's own isPastInstant,
// the actual source of truth checked again on every create/reschedule) is
// deliberately mirrored here at the UI layer so invalid choices are
// unselectable rather than merely rejected after the fact.
export function isPastDayKey(dayKey: string): boolean {
  const [year, month, date] = dayKey.split("-").map(Number);
  const startOfDay = new Date(year, month - 1, date);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return startOfDay.getTime() < startOfToday.getTime();
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
