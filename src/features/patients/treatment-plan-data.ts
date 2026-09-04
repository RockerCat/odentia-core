import type { SupabaseClient } from "@supabase/supabase-js";

// Real "Plan de Tratamiento" data — public.patient_treatment_plan_items
// (see the migration): a treatment is "active" ONLY if it exists
// explicitly here with status planned/in_progress — never inferred from
// patient_clinical_encounters, appointments.reason, or the treatments
// catalog itself. There is no client-facing "plan" fetch — a patient's
// plan is an implementation detail (see the migration's own comment on
// why patient_treatment_plans has no useful client-visible fields of its
// own); everything the UI needs comes from this one items list.

export type TreatmentPlanItemStatus = "planned" | "in_progress" | "completed" | "cancelled";

export const ACTIVE_TREATMENT_STATUSES: TreatmentPlanItemStatus[] = ["planned", "in_progress"];

export type TreatmentPlanItem = {
  id: string;
  planId: string;
  patientId: string;
  treatmentId: string | null;
  // Snapshot taken at write time — never a live join to the catalog, so a
  // later rename/deactivation there can never retroactively change what
  // this item's own history says it was (see the migration's own comment).
  treatmentName: string;
  status: TreatmentPlanItemStatus;
  notes: string | null;
  sortOrder: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapTreatmentPlanItemRow(row: {
  id: string;
  plan_id: string;
  patient_id: string;
  treatment_id: string | null;
  treatment_name: string;
  status: string;
  notes: string | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}): TreatmentPlanItem {
  return {
    id: row.id,
    planId: row.plan_id,
    patientId: row.patient_id,
    treatmentId: row.treatment_id,
    treatmentName: row.treatment_name,
    status: row.status as TreatmentPlanItemStatus,
    notes: row.notes,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// clinic_id filter is redundant with RLS (patient_treatment_plan_items_select_member
// already scopes to the caller's own clinic membership) — kept as an
// explicit second check anyway, same convention as the other clinical
// fetchers. Ordered by sort_order (creation order) — the Resumen card and
// the plan modal each apply their own status filter client-side against
// this one fetch, not a second round trip per view. Returns [] for a
// patient with no plan yet (get_or_create_patient_treatment_plan() only
// ever runs on the first WRITE — see the migration — so "no rows" is the
// normal, honest empty state here, not an error).
export async function fetchPatientTreatmentPlanItems(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<TreatmentPlanItem[]> {
  const { data, error } = await supabase
    .from("patient_treatment_plan_items")
    .select("id, plan_id, patient_id, treatment_id, treatment_name, status, notes, sort_order, created_by, updated_by, created_at, updated_at")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapTreatmentPlanItemRow);
}
