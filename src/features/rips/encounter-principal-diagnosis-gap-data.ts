import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateLabel } from "@/features/dashboard/real-format";

// Read-only context for "Completar diagnóstico principal"
// (CompleteEncounterPrincipalDiagnosisModal) — same convention as
// encounter-rips-field-gap-data.ts: re-reads the real current
// encounter_diagnoses/encounter_services rows fresh at modal-open time,
// never trusting the readiness snapshot the screen already has for
// anything beyond "which encounter to open." Tenant safety here is
// defense-in-depth only — the real boundary is each table's own RLS plus
// the caller's own clinic_id filter; the actual WRITE
// (add_missing_finalized_encounter_principal_diagnosis) re-derives and
// re-checks everything itself server-side regardless of what this helper
// returned.
export type EncounterPrincipalDiagnosisGapContext = {
  encounterId: string;
  patientName: string;
  encounterDateLabel: string;
  // Re-checked fresh — should always be false when this modal is opened
  // from a real readiness gap, but never assumed: the RPC's own
  // missing-only guard is the real defense, this is only what decides
  // whether the form renders at all.
  hasPrincipal: boolean;
  // Whether diagnosisTypeCode should be REQUIRED in the form — DT1 v003
  // only requires it for a consultation-classified service (see
  // CONSULTATION_DIAGNOSIS_TYPE_MISSING, export-readiness.ts); a
  // procedure-only encounter never needs it.
  requiresDiagnosisType: boolean;
  services: { id: string; cupsCode: string; ripsServiceType: "consultation" | "procedure" | "unknown"; clinicalConceptNameSnapshot: string | null }[];
};

export async function fetchEncounterPrincipalDiagnosisGapContext(
  supabase: SupabaseClient,
  clinicId: string,
  encounterId: string,
): Promise<EncounterPrincipalDiagnosisGapContext | null> {
  const encounterResult = await supabase
    .from("patient_clinical_encounters")
    .select("id, patient_id, occurred_at, finalized_at")
    .eq("id", encounterId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (encounterResult.error || !encounterResult.data || !encounterResult.data.finalized_at) return null;
  const encounter = encounterResult.data;

  const [patientResult, servicesResult, principalResult] = await Promise.all([
    supabase.from("patients").select("first_name, last_name").eq("id", encounter.patient_id).eq("clinic_id", clinicId).maybeSingle(),
    supabase
      .from("encounter_services")
      .select("id, cups_code, rips_service_type, clinical_concept_name_snapshot")
      .eq("encounter_id", encounterId)
      .eq("clinic_id", clinicId),
    supabase.from("encounter_diagnoses").select("id").eq("encounter_id", encounterId).eq("clinic_id", clinicId).eq("role", "principal"),
  ]);
  if (servicesResult.error || !servicesResult.data || principalResult.error) return null;

  return {
    encounterId,
    patientName: patientResult.data ? `${patientResult.data.first_name} ${patientResult.data.last_name}`.trim() : "",
    encounterDateLabel: formatDateLabel(encounter.occurred_at),
    hasPrincipal: (principalResult.data ?? []).length > 0,
    requiresDiagnosisType: servicesResult.data.some((row) => row.rips_service_type === "consultation"),
    services: servicesResult.data.map((row) => ({
      id: row.id,
      cupsCode: row.cups_code,
      ripsServiceType: row.rips_service_type,
      clinicalConceptNameSnapshot: row.clinical_concept_name_snapshot,
    })),
  };
}
