import { CANCELLATION_REASONS } from "@/features/portal/cancellation-reasons";
import type { Appointment, AppointmentStatus } from "./appointments-data";

// What staff sees about WHY/BY WHOM a Cita was cancelled — only real
// persisted values (appointments.cancelled_by / cancellation_reason_code /
// cancellation_reason_detail), labels from the same catalog the Portal's
// "Cancelar cita" modal writes (cancellation-reasons.ts). Nothing invented:
// no motivo row when none was recorded, no detail unless "Otro" has text.

export type CancellationInfo = {
  cancelledByLabel: "Paciente" | "Clínica";
  reasonLabel: string | null;
  detail: string | null;
};

export function getCancellationInfo(
  appointment: Pick<Appointment, "status" | "cancelledBy" | "cancellationReasonCode" | "cancellationReasonDetail">,
): CancellationInfo | null {
  if (appointment.status !== "cancelled") return null;
  // Only the Portal's cancel_my_appointment() sets cancelled_by ('patient');
  // every other cancellation (staff "Cancelar cita", or any predating it)
  // was the clinic's.
  const cancelledByLabel = appointment.cancelledBy === "patient" ? "Paciente" : "Clínica";
  const code = appointment.cancellationReasonCode ?? null;
  const reasonLabel = code ? (CANCELLATION_REASONS.find((r) => r.code === code)?.label ?? null) : null;
  const detail = code === "other" ? appointment.cancellationReasonDetail?.trim() || null : null;
  return { cancelledByLabel, reasonLabel, detail };
}

// Mirrors validate_appointment_status_transition(): moving a Cita out of
// `cancelled` clears its cancellation data — applied to the local copy so
// the modal never shows a stale motivo after "Reactivar"/a status change.
export function applyStatusLocally<T extends Pick<Appointment, "status" | "cancelledBy" | "cancellationReasonCode" | "cancellationReasonDetail">>(
  appointment: T,
  nextStatus: AppointmentStatus,
): T {
  if (appointment.status === "cancelled" && nextStatus !== "cancelled") {
    return { ...appointment, status: nextStatus, cancelledBy: null, cancellationReasonCode: null, cancellationReasonDetail: null };
  }
  return { ...appointment, status: nextStatus };
}
