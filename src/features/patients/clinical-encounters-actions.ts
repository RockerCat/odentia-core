import { createClient } from "@/lib/supabase/client";
import { mapClinicalEncounterRow, type ClinicalEncounterRecord } from "./clinical-encounters-data";

// The one sanctioned write path — always through
// insert_patient_clinical_encounter() (see the patient_clinical_encounters
// migration), never a direct table INSERT (there is no INSERT policy,
// deliberately). Resolves clinic_id/attended_by itself server-side and
// re-checks is_active_clinical_professional() — this client wrapper never
// sends clinic_id or attended_by, same convention as
// tooth-findings-actions.ts's insertPatientToothFinding. First real caller:
// "Finalizar atención" (src/features/dashboard/real-clinical-encounter-screen.tsx).
//
// appointmentId is optional (manual/historical encounters have none) but
// when passed, the RPC is idempotent by it (see the appointment_id
// migration's own comment): calling this twice for the same appointmentId
// — a retried finalize, or two concurrent tabs — always returns the SAME
// row, never inserts a second one.

export type InsertClinicalEncounterInput = {
  patientId: string;
  appointmentId?: string | null;
  occurredAt: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
};

export type ClinicalEncounterOutcome =
  | { status: "ok"; encounter: ClinicalEncounterRecord }
  | { status: "error"; message: string };

export async function insertPatientClinicalEncounter(input: InsertClinicalEncounterInput): Promise<ClinicalEncounterOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("insert_patient_clinical_encounter", {
    p_patient_id: input.patientId,
    p_occurred_at: input.occurredAt,
    p_reason: input.reason,
    p_diagnosis: input.diagnosis,
    p_treatment: input.treatment,
    p_notes: input.notes,
    p_appointment_id: input.appointmentId ?? null,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para registrar esta atención." };
    }
    return { status: "error", message: "No pudimos registrar la atención. Intenta de nuevo." };
  }

  return { status: "ok", encounter: mapClinicalEncounterRow(data) };
}
