import { createClient } from "@/lib/supabase/client";
import type { Treatment } from "./data";

// Real writes on public.treatments — under treatments_insert_admin /
// treatments_update_admin RLS (clinic_admin only, see the treatments
// migration). No DELETE here — there's no DELETE policy either (same
// active=false convention as patients/professional_profiles): a treatment
// that already backs an appointment's `reason` snapshot must stay
// findable, just excluded from the active picker.

export type ActionOutcome = { status: "ok" } | { status: "error"; message: string };
export type CreateTreatmentOutcome = { status: "ok"; treatment: Treatment } | { status: "error"; message: string };

const DUPLICATE_NAME_ERROR = "Ya existe un tratamiento con este nombre en tu clínica.";
const GENERIC_ERROR = "No pudimos guardar el cambio. Intenta de nuevo.";

function mapRow(row: { id: string; clinic_id: string; name: string; active: boolean; created_at: string }): Treatment {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
  };
}

export async function createTreatment(clinicId: string, name: string): Promise<CreateTreatmentOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("treatments")
    .insert({ clinic_id: clinicId, name })
    .select("id, clinic_id, name, active, created_at")
    .single();

  if (error) {
    // treatments_clinic_id_name_key — one name per clinic, not global.
    if (error.code === "23505") return { status: "error", message: DUPLICATE_NAME_ERROR };
    return { status: "error", message: GENERIC_ERROR };
  }

  return { status: "ok", treatment: mapRow(data) };
}

export async function renameTreatment(treatmentId: string, name: string): Promise<ActionOutcome> {
  const supabase = createClient();
  const { error } = await supabase.from("treatments").update({ name }).eq("id", treatmentId);
  if (error) {
    if (error.code === "23505") return { status: "error", message: DUPLICATE_NAME_ERROR };
    return { status: "error", message: GENERIC_ERROR };
  }
  return { status: "ok" };
}

export async function setTreatmentActive(treatmentId: string, active: boolean): Promise<ActionOutcome> {
  const supabase = createClient();
  const { error } = await supabase.from("treatments").update({ active }).eq("id", treatmentId);
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok" };
}
