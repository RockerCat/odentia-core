import type { AppointmentStatus } from "@/features/dashboard/appointments-data";

// Mirrors confirm_my_appointment's own eligibility check exactly (the RPC
// is the actual authority — see that migration's own comment; this only
// decides whether to SHOW the "Confirmar asistencia" button, never a
// second source of truth). Only a still-"scheduled" appointment (Agenda's
// "Programada" stage, before the clinic or patient does anything else to
// it) that hasn't started yet is confirmable — every other real status
// (confirmed/patient_arrived/waiting_room/in_progress/completed/no_show/
// cancelled) is excluded, and a `scheduled` appointment whose starts_at is
// already in the past is excluded too (the RPC rejects it as "already
// occurred").
export function canPatientConfirmAppointment(
  appointment: { status: AppointmentStatus; startsAt: string },
  now: Date = new Date(),
): boolean {
  return appointment.status === "scheduled" && new Date(appointment.startsAt).getTime() >= now.getTime();
}
