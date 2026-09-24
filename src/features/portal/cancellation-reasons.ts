// "Motivo de cancelación" — the options the Portal's "Cancelar cita" modal
// offers for a NEW cancellation, stored as stable codes
// (appointments.cancellation_reason_code). Operational reasons only;
// "Otro" requires the patient's own short text.
//
// "Necesito reprogramar" (need_reschedule) was retired 2026-09-24: the
// Portal has its own "Reprogramar" flow, so it's no longer a way to cancel.
// cancel_my_appointment() rejects it for new cancellations (migration
// 20260924150000); rows that already carry it keep it untouched and still
// display with their historical label (CANCELLATION_REASON_LABELS).
export const CANCELLATION_REASONS = [
  { code: "cannot_attend", label: "No puedo asistir" },
  { code: "personal", label: "Problema personal" },
  { code: "other", label: "Otro" },
] as const;

export type CancellationReasonCode = (typeof CANCELLATION_REASONS)[number]["code"];

// Display labels for every code that may exist on a stored Cita — the
// selectable ones plus retired ones kept only for history.
export const CANCELLATION_REASON_LABELS: Record<string, string> = {
  ...Object.fromEntries(CANCELLATION_REASONS.map((r) => [r.code, r.label])),
  need_reschedule: "Necesito reprogramar",
};

export function isValidCancellationInput(code: string, detail: string): code is CancellationReasonCode {
  if (!CANCELLATION_REASONS.some((r) => r.code === code)) return false;
  return code !== "other" || detail.trim().length > 0;
}
