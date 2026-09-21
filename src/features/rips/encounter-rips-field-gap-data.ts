import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateLabel } from "@/features/dashboard/real-format";

// Read-only context for "Completar Finalidad/Causa" (CompleteEncounterRipsFieldModal)
// — same convention as encounter-rips-service-gap-data.ts (A4B): re-reads
// the real current encounter_services rows fresh at modal-open time,
// never trusting the readiness snapshot the screen already has for
// anything beyond "which encounter to open." Tenant safety here is
// defense-in-depth only — the real boundary is each table's own RLS plus
// the caller's own clinic_id filter; the actual WRITE
// (correct_encounter_service_rips_field) re-derives and re-checks
// everything itself server-side regardless of what this helper returned.
export type EncounterRipsFieldGapService = {
  id: string;
  cupsCode: string;
  ripsServiceType: "consultation" | "procedure" | "unknown";
  clinicalConceptNameSnapshot: string | null;
  // Only the fields still missing are ever shown as editable by the
  // modal — a field that already has a value here must never be
  // rendered as an open input (see this task's own UX instruction).
  missingFinalidad: boolean;
  missingCausaMotivo: boolean;
};

export type EncounterRipsFieldGapContext = {
  encounterId: string;
  patientName: string;
  encounterDateLabel: string;
  services: EncounterRipsFieldGapService[];
};

export async function fetchEncounterRipsFieldGapContext(
  supabase: SupabaseClient,
  clinicId: string,
  encounterId: string,
): Promise<EncounterRipsFieldGapContext | null> {
  const encounterResult = await supabase
    .from("patient_clinical_encounters")
    .select("id, patient_id, occurred_at, finalized_at")
    .eq("id", encounterId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (encounterResult.error || !encounterResult.data || !encounterResult.data.finalized_at) return null;
  const encounter = encounterResult.data;

  const [patientResult, servicesResult] = await Promise.all([
    supabase.from("patients").select("first_name, last_name").eq("id", encounter.patient_id).eq("clinic_id", clinicId).maybeSingle(),
    supabase
      .from("encounter_services")
      .select("id, cups_code, rips_service_type, clinical_concept_name_snapshot, finalidad_code, causa_motivo_code")
      .eq("encounter_id", encounterId)
      .eq("clinic_id", clinicId)
      // Only a service genuinely missing something this modal can fix —
      // re-derived fresh here, same eligibility the readiness checks
      // themselves use (export-readiness.ts's SERVICE_FINALIDAD_MISSING/
      // CONSULTATION_CAUSA_MOTIVO_MISSING), never trusted from the caller.
      .or("finalidad_code.is.null,and(rips_service_type.eq.consultation,causa_motivo_code.is.null)"),
  ]);
  if (servicesResult.error || !servicesResult.data) return null;

  const services: EncounterRipsFieldGapService[] = servicesResult.data.map((row) => ({
    id: row.id,
    cupsCode: row.cups_code,
    ripsServiceType: row.rips_service_type,
    clinicalConceptNameSnapshot: row.clinical_concept_name_snapshot,
    missingFinalidad: row.finalidad_code === null,
    missingCausaMotivo: row.rips_service_type === "consultation" && row.causa_motivo_code === null,
  }));

  return {
    encounterId,
    patientName: patientResult.data ? `${patientResult.data.first_name} ${patientResult.data.last_name}`.trim() : "",
    encounterDateLabel: formatDateLabel(encounter.occurred_at),
    services,
  };
}
