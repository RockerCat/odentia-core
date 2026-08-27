import { createClient } from "@/lib/supabase/client";
import { mapMedicalHistoryRow, type PatientMedicalHistory } from "./medical-history-data";

// The one sanctioned write path — always through
// upsert_patient_medical_history() (see the patient_medical_histories
// migration), never a direct table INSERT/UPDATE (there is no RLS policy
// for either, deliberately). The RPC resolves the patient's real clinic_id
// and auth.uid() itself server-side and re-checks authorization
// (is_active_clinical_professional) — this client wrapper never sends
// clinic_id or updated_by, and never assumes the UI's own
// canEditClinicalData() check is sufficient on its own.
export type UpsertMedicalHistoryInput = {
  patientId: string;
  allergies: string | null;
  currentMedications: string | null;
  medicalConditions: string | null;
  surgeriesOrHospitalizations: string | null;
  relevantFamilyHistory: string | null;
  observations: string | null;
};

export type UpsertMedicalHistoryOutcome =
  | { status: "ok"; history: PatientMedicalHistory }
  | { status: "error"; message: string };

export async function upsertPatientMedicalHistory(
  input: UpsertMedicalHistoryInput,
): Promise<UpsertMedicalHistoryOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("upsert_patient_medical_history", {
    p_patient_id: input.patientId,
    p_allergies: input.allergies,
    p_current_medications: input.currentMedications,
    p_medical_conditions: input.medicalConditions,
    p_surgeries_or_hospitalizations: input.surgeriesOrHospitalizations,
    p_relevant_family_history: input.relevantFamilyHistory,
    p_observations: input.observations,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para editar los antecedentes de este paciente." };
    }
    return { status: "error", message: "No pudimos guardar los antecedentes. Intenta de nuevo." };
  }

  return { status: "ok", history: mapMedicalHistoryRow(data) };
}
