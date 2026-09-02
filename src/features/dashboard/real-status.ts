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

// CLAUDE.md's Appointment Lifecycle: an in_progress Cita is never
// auto-completed just because time passed, but one still in_progress more
// than this long after its scheduled end is an operational anomaly —
// "Sin cerrar" — not a real DB status, only a derived display value.
// Centralized here (the single place the real 8-value status vocabulary is
// already keyed) so Agenda, the appointment detail modal, and every
// history list read the same grace period and render the same label.
export const UNRESOLVED_IN_PROGRESS_GRACE_MINUTES = 120;

export type DisplayStatus = AppointmentStatus | "unresolved";

export function isUnresolvedInProgress(
  appointment: Pick<Appointment, "status" | "startsAt" | "durationMinutes">,
  now: Date = new Date(),
): boolean {
  if (appointment.status !== "in_progress") return false;
  const graceDeadline =
    new Date(endTimeIso(appointment.startsAt, appointment.durationMinutes)).getTime() +
    UNRESOLVED_IN_PROGRESS_GRACE_MINUTES * 60_000;
  return now.getTime() > graceDeadline;
}

// Wraps the real `status` with the derived "unresolved" value — the only
// status this codebase should ever branch display on. The DB status stays
// "in_progress"; nothing here writes to it.
export function getDisplayStatus(
  appointment: Pick<Appointment, "status" | "startsAt" | "durationMinutes">,
  now: Date = new Date(),
): DisplayStatus {
  return isUnresolvedInProgress(appointment, now) ? "unresolved" : appointment.status;
}

const UNRESOLVED_LABEL = "Sin cerrar";
// Reuses the existing no_show color token — an operational anomaly, not the
// live "En curso"/info reading — rather than introduce a new design token.
const UNRESOLVED_STYLE = "border-noshow/25 bg-noshow/10 text-noshow";
const UNRESOLVED_HISTORY_BADGE_CLASS = "border-noshow/25 bg-noshow/10 text-noshow";

export function getStatusLabel(status: DisplayStatus): string {
  return status === "unresolved" ? UNRESOLVED_LABEL : REAL_STATUS_LABELS[status];
}

export function getStatusStyle(status: DisplayStatus): string {
  return status === "unresolved" ? UNRESOLVED_STYLE : REAL_STATUS_STYLES[status];
}

export function getHistoryStatusBadgeClass(status: DisplayStatus): string {
  return status === "unresolved" ? UNRESOLVED_HISTORY_BADGE_CLASS : REAL_HISTORY_STATUS_BADGE_CLASS[status];
}
