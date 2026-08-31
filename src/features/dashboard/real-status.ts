import type { AppointmentStatus } from "./appointments-data";

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
