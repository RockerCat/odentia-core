import { createClient } from "@/lib/supabase/client";
import { mapTreatmentPlanItemRow, type TreatmentPlanItem, type TreatmentPlanItemStatus } from "./treatment-plan-data";

// The one sanctioned write path for each operation — always through
// insert_patient_treatment_plan_item()/update_patient_treatment_plan_item()/
// update_patient_treatment_plan_item_status() (see the
// patient_treatment_plans migration), never a direct table INSERT/UPDATE
// (there is no RLS policy for either). Each RPC resolves the real
// clinic_id and auth.uid() itself server-side and re-checks authorization
// (is_active_clinical_professional) — this client wrapper never sends
// clinic_id/created_by/updated_by, and never assumes the UI's own
// canEditClinicalData() check is sufficient on its own. There is no
// client-facing "create plan" call — the plan row is created implicitly
// by the first insert (see get_or_create_patient_treatment_plan).

export type TreatmentPlanItemOutcome =
  | { status: "ok"; item: TreatmentPlanItem }
  | { status: "error"; message: string };

export async function createTreatmentPlanItem(input: {
  patientId: string;
  treatmentId: string | null;
  treatmentName: string;
  notes: string | null;
}): Promise<TreatmentPlanItemOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("insert_patient_treatment_plan_item", {
    p_patient_id: input.patientId,
    p_treatment_id: input.treatmentId,
    p_treatment_name: input.treatmentName,
    p_notes: input.notes,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para agregar tratamientos a este paciente." };
    }
    return { status: "error", message: "No pudimos guardar el tratamiento. Intenta de nuevo." };
  }

  return { status: "ok", item: mapTreatmentPlanItemRow(data) };
}

export async function updateTreatmentPlanItem(input: {
  itemId: string;
  treatmentId: string | null;
  treatmentName: string;
  notes: string | null;
}): Promise<TreatmentPlanItemOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_patient_treatment_plan_item", {
    p_item_id: input.itemId,
    p_treatment_id: input.treatmentId,
    p_treatment_name: input.treatmentName,
    p_notes: input.notes,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para editar este tratamiento." };
    }
    return { status: "error", message: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  return { status: "ok", item: mapTreatmentPlanItemRow(data) };
}

// Status change only — a deliberately separate action from editing
// content above (same "editar" vs "cambiar estado" split the approved UX
// calls for). Never a physical delete: cancelled/completed items stay in
// the plan forever, just outside the "activo" filter.
export async function updateTreatmentPlanItemStatus(
  itemId: string,
  status: TreatmentPlanItemStatus,
): Promise<TreatmentPlanItemOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_patient_treatment_plan_item_status", {
    p_item_id: itemId,
    p_status: status,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para cambiar el estado de este tratamiento." };
    }
    return { status: "error", message: "No pudimos cambiar el estado. Intenta de nuevo." };
  }

  return { status: "ok", item: mapTreatmentPlanItemRow(data) };
}
