import { initialsOf } from "@/features/dashboard/real-format";
import type { PortalAppointment } from "./appointments-data";
import { splitPortalAppointments } from "./appointments-split";
import type { PortalAppointmentRequest } from "./requests-data";

// Mis citas (/portal/citas) — what the approved layout shows, derived ONLY
// from the patient's own real appointments/requests (already scoped by
// fetchMyAppointments/fetchMyAppointmentRequests). Pure, so the whole
// "what may this screen show" rule is unit-tested (my-appointments-view.test.ts).

export const HERO_HISTORY_LIMIT = 10;

export type MyAppointmentsView = {
  nextAppointment: PortalAppointment | null;
  otherUpcoming: PortalAppointment[];
  heroHistory: PortalAppointment[];
  history: PortalAppointment[];
  // At most one open NEW-appointment Solicitud at a time
  // (appointment_requests_one_pending_per_patient, kind 'new'). A pending
  // reschedule is per Cita instead — see pendingRescheduleFor.
  pendingRequest: PortalAppointmentRequest | null;
};

export function buildMyAppointmentsView(
  appointments: PortalAppointment[],
  requests: PortalAppointmentRequest[],
  now: Date = new Date(),
): MyAppointmentsView {
  const { upcoming, history } = splitPortalAppointments(appointments, now);
  return {
    nextAppointment: upcoming[0] ?? null,
    otherUpcoming: upcoming.slice(1),
    heroHistory: history.slice(0, HERO_HISTORY_LIMIT),
    history,
    pendingRequest: requests.find((r) => r.status === "pending" && r.kind === "new") ?? null,
  };
}

// The open reschedule request for THIS Cita, if any (at most one —
// appointment_requests_one_pending_reschedule_per_appointment).
export function pendingRescheduleFor(appointmentId: string, requests: PortalAppointmentRequest[]): PortalAppointmentRequest | null {
  return requests.find((r) => r.status === "pending" && r.kind === "reschedule" && r.appointmentId === appointmentId) ?? null;
}

// The "Próxima cita" professional card's fields — real values or null,
// never an invented default (the old screen showed "Odontología general"
// for a professional with no specialty on file). Null → the line is omitted.
export type ProfessionalCardFields = {
  name: string;
  initials: string;
  avatarUrl: string | undefined; // undefined → UserAvatar's neutral initials circle
  specialty: string | null;
  licenseNumber: string | null;
};

export function professionalCardFields(appointment: PortalAppointment): ProfessionalCardFields {
  const specialty = appointment.professionalSpecialty?.trim() || null;
  const licenseNumber = appointment.professionalLicenseNumber?.trim() || null;
  return {
    name: appointment.professionalName,
    initials: initialsOf(appointment.professionalName),
    avatarUrl: appointment.professionalAvatarUrl ?? undefined,
    specialty,
    licenseNumber,
  };
}

// A Cita's own reason (tratamiento/motivo) — never replaced by an invented
// "Consulta" when the clinic didn't record one.
export const NO_REASON_LABEL = "Sin especificar";

export function appointmentReasonLabel(appointment: Pick<PortalAppointment, "reason">): string {
  return appointment.reason?.trim() || NO_REASON_LABEL;
}
