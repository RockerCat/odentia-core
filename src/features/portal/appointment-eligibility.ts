import type { AppointmentStatus } from "@/features/dashboard/appointments-data";

// Mirrors confirm_my_appointment's own check (backend stays authoritative).
export function canPatientConfirmAppointment(
  appointment: { status: AppointmentStatus; startsAt: string },
  now: Date = new Date(),
): boolean {
  return appointment.status === "scheduled" && new Date(appointment.startsAt).getTime() >= now.getTime();
}

// Reprogramar / Cancelar cita from the Portal — only her own FUTURE Cita
// that is still scheduled/confirmed. Never once the clinical flow has
// started (Paciente llegó, Sala de espera, En curso) or it's closed
// (Completada, No asistió, Cancelada). Same rule, in the same terms, as
// request_my_appointment_reschedule()/cancel_my_appointment() in Postgres
// (20260924120000) — this only decides whether the buttons show.
const PATIENT_CHANGEABLE_STATUSES: AppointmentStatus[] = ["scheduled", "confirmed"];

export function canPatientChangeAppointment(
  appointment: { status: AppointmentStatus; startsAt: string },
  now: Date = new Date(),
): boolean {
  return PATIENT_CHANGEABLE_STATUSES.includes(appointment.status) && new Date(appointment.startsAt).getTime() > now.getTime();
}
