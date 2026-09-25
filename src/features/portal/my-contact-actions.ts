import { normalizePhone } from "@/features/clinic/personal-info-actions";
import { createClient } from "@/lib/supabase/client";

// Patient Portal "Editar información personal": the patient's OWN contact
// phone on her clinic's patient record (patients.phone — what the Portal,
// Pacientes and Agenda all show). update_my_patient_phone() (migration
// 20260925170000) resolves the row from auth.uid(); no id is sent. Name,
// document, birth date and email stay read-only (product decision).
export async function updateMyPatientPhone(input: string): Promise<{ status: "ok"; value: string | null } | { status: "error"; message: string }> {
  const checked = normalizePhone(input);
  if ("error" in checked) return { status: "error", message: checked.error };
  const { error } = await createClient().rpc("update_my_patient_phone", { p_phone: checked.value });
  if (error) return { status: "error", message: "No pudimos guardar tu teléfono. Intenta de nuevo." };
  return { status: "ok", value: checked.value };
}
