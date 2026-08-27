import type { SupabaseClient } from "@supabase/supabase-js";

// Real Antecedentes data — same convention as src/features/patients/data.ts
// (already-constructed SupabaseClient, so the same query runs unchanged
// server- or client-side). public.patient_medical_histories is the only
// table backing this (see the migration) — one row per patient, or none
// yet (a legitimate, handled empty state — see task scope, section 9).

export type PatientMedicalHistory = {
  id: string;
  patientId: string;
  allergies: string | null;
  currentMedications: string | null;
  medicalConditions: string | null;
  surgeriesOrHospitalizations: string | null;
  relevantFamilyHistory: string | null;
  observations: string | null;
  updatedBy: string | null;
  updatedAt: string;
};

export function mapMedicalHistoryRow(row: {
  id: string;
  patient_id: string;
  allergies: string | null;
  current_medications: string | null;
  medical_conditions: string | null;
  surgeries_or_hospitalizations: string | null;
  relevant_family_history: string | null;
  observations: string | null;
  updated_by: string | null;
  updated_at: string;
}): PatientMedicalHistory {
  return {
    id: row.id,
    patientId: row.patient_id,
    allergies: row.allergies,
    currentMedications: row.current_medications,
    medicalConditions: row.medical_conditions,
    surgeriesOrHospitalizations: row.surgeries_or_hospitalizations,
    relevantFamilyHistory: row.relevant_family_history,
    observations: row.observations,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

// clinic_id filter is redundant with RLS (patient_medical_histories_select_member
// already scopes to the caller's own clinic membership) — kept as an
// explicit second check anyway, same convention as fetchPatientById (see
// CLAUDE.md task scope: RLS is a second layer, not the only one).
export async function fetchPatientMedicalHistory(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<PatientMedicalHistory | null> {
  const { data, error } = await supabase
    .from("patient_medical_histories")
    .select(
      "id, patient_id, allergies, current_medications, medical_conditions, surgeries_or_hospitalizations, relevant_family_history, observations, updated_by, updated_at",
    )
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapMedicalHistoryRow(data) : null;
}
