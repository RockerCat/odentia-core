// "Motivo de cancelación" — the approved Cancelar cita modal's own options,
// stored as stable codes (appointments.cancellation_reason_code, checked
// in Postgres — see 20260924120000). Operational reasons only; "Otro"
// requires the patient's own short text.
export const CANCELLATION_REASONS = [
  { code: "cannot_attend", label: "No puedo asistir" },
  { code: "need_reschedule", label: "Necesito reprogramar" },
  { code: "personal", label: "Problema personal" },
  { code: "other", label: "Otro" },
] as const;

export type CancellationReasonCode = (typeof CANCELLATION_REASONS)[number]["code"];

export function isValidCancellationInput(code: string, detail: string): code is CancellationReasonCode {
  if (!CANCELLATION_REASONS.some((r) => r.code === code)) return false;
  return code !== "other" || detail.trim().length > 0;
}
