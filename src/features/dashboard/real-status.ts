import type { Appointment, AppointmentStatus } from "./appointments-data";
import { endTimeIso } from "./real-format";

// Real 8-value status vocabulary (see CLAUDE.md's Appointment Lifecycle and
// the appointments migration) — NOT mock-data.ts's flattened 6-value
// AppointmentStatus. Colors/labels for the 6 values both vocabularies share
// are copied verbatim from mock-data.ts's STATUS_LABELS/STATUS_STYLES (the
// approved demo's own palette, never redesigned). `patient_arrived` and
// `waiting_room` are new labels/styles for values no UI action sets yet in
// this iteration (see the migration's own comment) — included so the board
// renders sensibly if either is ever reached (a future front-desk flow, or
// direct DB access), not because any current button produces them.
export const REAL_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Pendiente",
  confirmed: "Confirmada",
  patient_arrived: "Paciente llegó",
  waiting_room: "En sala de espera",
  in_progress: "En curso",
  completed: "Completada",
  no_show: "No asistió",
  cancelled: "Cancelada",
};

export const REAL_STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: "border-warning/25 bg-warning/10 text-warning",
  confirmed: "border-primary/25 bg-primary/10 text-primary",
  patient_arrived: "border-info/25 bg-info/10 text-info",
  waiting_room: "border-info/25 bg-info/10 text-info",
  in_progress: "border-info/25 bg-info/10 text-info",
  completed: "border-border bg-foreground/[0.03] text-muted-foreground",
  no_show: "border-noshow/25 bg-noshow/10 text-noshow",
  cancelled: "border-danger/20 bg-danger/5 text-danger/70",
};

// The patient-history timeline's own status→color mapping — copied
// verbatim from mock-data.ts's HISTORY_STATUS_BADGE_CLASS (the approved
// demo's own palette): Completada reads as the "good" outcome (primary),
// Cancelada fades to neutral gray, everywhere else stays the same info/
// warning/noshow read as the live schedule. Deliberately NOT
// REAL_STATUS_STYLES above — see that file's own comment for why the
// history badge uses a different mapping than the header badge/agenda
// grid/"Cambiar estado". `scheduled`/`patient_arrived`/`waiting_room` have
// no mock equivalent (see REAL_STATUS_STYLES above); mapped to the same
// warning/info reading their live-schedule color already uses.
export const REAL_HISTORY_STATUS_BADGE_CLASS: Record<AppointmentStatus, string> = {
  scheduled: "border-warning/25 bg-warning/10 text-warning",
  confirmed: "border-info/25 bg-info/10 text-info",
  patient_arrived: "border-info/25 bg-info/10 text-info",
  waiting_room: "border-info/25 bg-info/10 text-info",
  in_progress: "border-info/25 bg-info/10 text-info",
  completed: "border-primary/25 bg-primary/10 text-primary",
  no_show: "border-noshow/25 bg-noshow/10 text-noshow",
  cancelled: "border-border bg-foreground/[0.04] text-muted-foreground",
};

// The status editor's dropdown options — matches the approved demo's own
// CHANGEABLE_STATUSES exactly (confirmed/pending/in-progress/completed,
// renamed to the real enum's confirmed/scheduled/in_progress/completed).
// `cancelled` has its own dedicated "Cancelar cita" flow (not this
// dropdown); `patient_arrived`/`waiting_room`/`no_show` have no UI action
// in this iteration — see the migration's comment.
export const CHANGEABLE_STATUSES: AppointmentStatus[] = ["confirmed", "scheduled", "in_progress", "completed"];

// CLAUDE.md's Appointment Lifecycle: a non-terminal Cita is never
// auto-completed, auto-cancelled, or auto-marked "No asistió" just because
// time passed — but one still open more than this long after its scheduled
// end (startsAt + durationMinutes) is an operational anomaly: "Sin cerrar".
// This covers BOTH cases the lifecycle doc describes: an in_progress Cita
// still running past its grace period, and a scheduled/confirmed (or
// patient_arrived/waiting_room) Cita that never started attention at all.
// Neither is a real DB status — only a derived display value, and neither
// ever writes to `status` on its own. Centralized here (the single place
// the real 8-value status vocabulary is already keyed) so Agenda, the
// appointment detail modal, and every history list read the same grace
// period and render the same label for whichever case applies.
export const UNRESOLVED_GRACE_MINUTES = 120;

export type DisplayStatus = AppointmentStatus | "unresolved";

// The one place "which statuses close a Cita for good" is defined —
// reused by isTerminalStatus below, RealAppointmentDetailModal's own
// isTerminal, and appointments-actions.ts's overlap check (as a literal
// list for its SQL `.not(..., "in", ...)` filter), instead of each
// repeating the same three-status comparison or list.
export const TERMINAL_STATUSES: AppointmentStatus[] = ["completed", "no_show", "cancelled"];

export function isTerminalStatus(status: AppointmentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isUnresolved(
  appointment: Pick<Appointment, "status" | "startsAt" | "durationMinutes">,
  now: Date = new Date(),
): boolean {
  if (isTerminalStatus(appointment.status)) return false;
  const graceDeadline =
    new Date(endTimeIso(appointment.startsAt, appointment.durationMinutes)).getTime() + UNRESOLVED_GRACE_MINUTES * 60_000;
  return now.getTime() > graceDeadline;
}

// Wraps the real `status` with the derived "unresolved" value — the only
// status this codebase should ever branch display on. The DB status is
// untouched either way.
export function getDisplayStatus(
  appointment: Pick<Appointment, "status" | "startsAt" | "durationMinutes">,
  now: Date = new Date(),
): DisplayStatus {
  return isUnresolved(appointment, now) ? "unresolved" : appointment.status;
}

const UNRESOLVED_LABEL = "Sin cerrar";
// Reuses the existing no_show color token — an operational anomaly, not the
// live "En curso"/info reading — rather than introduce a new design token.
const UNRESOLVED_STYLE = "border-noshow/25 bg-noshow/10 text-noshow";
const UNRESOLVED_HISTORY_BADGE_CLASS = "border-noshow/25 bg-noshow/10 text-noshow";

// "Iniciar atención" opens this early relative to startsAt — a
// professional running ahead of schedule isn't blocked, but the CTA can't
// be used hours in advance either.
export const START_ENCOUNTER_WINDOW_MINUTES = 30;

// Whether "Iniciar/Continuar atención" is allowed for this Cita right now
// — the single source of truth for RealAppointmentDetailModal's primary
// CTA and the real /agenda/atencion/[appointmentId] route's own
// server-side guard (which must reject the same cases outright, not just
// hide a button — see that route's own comment). Pure function of
// (appointment, now): no role or professional-profile knowledge, since
// that's a separate gate (canAttendPatients/Assistant) callers AND this
// together, never folded in here.
//   - Terminal (completed/cancelled/no_show): never — a closed Cita has
//     nothing left to start.
//   - in_progress: always — this is "Continuar atención", not a new
//     start, and has no time window of its own.
//   - Anything else (scheduled/confirmed/patient_arrived/waiting_room):
//     only from START_ENCOUNTER_WINDOW_MINUTES before startsAt onward.
//     There's no upper bound — once the window opens it never closes on
//     its own, covering both "during the appointment" and arbitrarily
//     long after (including well past isUnresolved's own grace period: a
//     "Sin cerrar" Cita that never started attention must stay startable
//     until something else resolves it, per CLAUDE.md's Appointment
//     Lifecycle).
export function canStartClinicalEncounter(
  appointment: Pick<Appointment, "status" | "startsAt">,
  now: Date = new Date(),
): boolean {
  if (isTerminalStatus(appointment.status)) return false;
  if (appointment.status === "in_progress") return true;
  const startMs = new Date(appointment.startsAt).getTime();
  return now.getTime() >= startMs - START_ENCOUNTER_WINDOW_MINUTES * 60_000;
}

// Real double-booking is possible today — nothing in createAppointment/
// updateAppointment prevents two Citas from landing on the exact same
// professional+startsAt slot (see appointments-actions.ts's own comment:
// only a past-date check exists, no overlap check) — and the Agenda grid
// only ever renders ONE appointment per visible slot cell. Before this,
// that cell picked whichever row happened to come first in fetch/insertion
// order, with no regard for status: a stale `completed` row from old test
// data occupying the same slot as a real, live `confirmed` Cita would
// silently win, making the actual live appointment unreachable by
// clicking that cell at all — its detail modal would show the WRONG
// Cita's status ("Completada") while a separate fetch elsewhere (e.g. the
// patient history panel, a different query entirely) correctly showed the
// live one ("Confirmada"), reading as a "status inconsistency" that was
// actually two different appointments being conflated into one grid cell.
// This doesn't fix double-booking itself (see createAppointment/
// updateAppointment's own overlap check, the real fix for new bookings)
// but ensures existing collisions never hide the one Cita a user actually
// needs to act on.
export function pickSlotAppointment<T extends Pick<Appointment, "status">>(candidates: T[]): T | null {
  return candidates.find((a) => !isTerminalStatus(a.status)) ?? candidates[0] ?? null;
}

export function getStatusLabel(status: DisplayStatus): string {
  return status === "unresolved" ? UNRESOLVED_LABEL : REAL_STATUS_LABELS[status];
}

export function getStatusStyle(status: DisplayStatus): string {
  return status === "unresolved" ? UNRESOLVED_STYLE : REAL_STATUS_STYLES[status];
}

export function getHistoryStatusBadgeClass(status: DisplayStatus): string {
  return status === "unresolved" ? UNRESOLVED_HISTORY_BADGE_CLASS : REAL_HISTORY_STATUS_BADGE_CLASS[status];
}
