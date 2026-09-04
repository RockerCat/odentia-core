import { createClient } from "@/lib/supabase/client";
import { mapClinicalEncounterRow, type ClinicalEncounterRecord } from "./clinical-encounters-data";

// The one sanctioned write path — always through
// upsert_patient_clinical_encounter() (see the 20260903120000 migration),
// never a direct table INSERT/UPDATE (there is no INSERT/UPDATE policy,
// deliberately). Resolves clinic_id/attended_by itself server-side and
// re-checks is_active_clinical_professional() — this client wrapper never
// sends clinic_id or attended_by, same convention as
// tooth-findings-actions.ts's insertPatientToothFinding.
//
// Idempotent by appointmentId when one is passed (see the migration's own
// comment): the first call for a given appointmentId creates the draft row
// ("Guardar borrador"); every subsequent call — another draft save, or
// "Finalizar atención" (finalize: true) — updates that SAME row in place,
// never inserts a second one. Once a row is finalized, further calls
// return it unchanged rather than overwriting a real clinical record.
//
// procedures replaces the encounter's full procedure list every call — the
// UI always edits the whole set client-side (add/remove/edit rows), so a
// wholesale replace (not a per-row diff) is the correct match, and is what
// the RPC actually does under the hood.

export type UpsertClinicalEncounterInput = {
  patientId: string;
  appointmentId?: string | null;
  occurredAt: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  indications: string | null;
  procedures: { name: string; note: string | null }[];
  finalize?: boolean;
};

export type ClinicalEncounterOutcome =
  | { status: "ok"; encounter: ClinicalEncounterRecord }
  | { status: "error"; message: string };

export async function upsertPatientClinicalEncounter(input: UpsertClinicalEncounterInput): Promise<ClinicalEncounterOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("upsert_patient_clinical_encounter", {
    p_patient_id: input.patientId,
    p_occurred_at: input.occurredAt,
    p_reason: input.reason,
    p_diagnosis: input.diagnosis,
    p_treatment: input.treatment,
    p_notes: input.notes,
    p_indications: input.indications,
    p_procedures: input.procedures,
    p_appointment_id: input.appointmentId ?? null,
    p_finalize: input.finalize ?? false,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para registrar esta atención." };
    }
    return { status: "error", message: "No pudimos guardar la atención. Intenta de nuevo." };
  }

  return { status: "ok", encounter: mapClinicalEncounterRow(data) };
}
