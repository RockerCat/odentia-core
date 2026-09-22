import { createClient } from "@/lib/supabase/client";

export type SetClinicCommercialStatusResult = { id: string; status: "active" | "suspended" };

// "Platform → Clínica → Estado comercial: Suspender/Reactivar". Calls
// set_clinic_commercial_status() (pilot subscription controls migration)
// — Superadmin-gated server-side (is_platform_superadmin()), clinic_id an
// explicit parameter (a Superadmin has no membership of her own to derive
// it from, same reasoning as every other Platform RPC). clinics.status is
// column-grant-locked to this RPC only — a Clinic Admin can no longer
// write it via a raw client update (see that migration's own header
// comment for the real gap this closed).
export async function setClinicCommercialStatus(
  clinicId: string,
  status: "active" | "suspended",
): Promise<SetClinicCommercialStatusResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("set_clinic_commercial_status", {
    p_clinic_id: clinicId,
    p_status: status,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return { id: row.id, status: row.status };
}

export type ExtendClinicTrialResult = { id: string; trialEndsAt: string };

// "Platform → Clínica → Estado comercial: Extender periodo de prueba".
// Calls extend_clinic_trial() — same Superadmin-only gate/column-lock
// reasoning as setClinicCommercialStatus above. Takes the resulting date
// directly (never a "+N days" delta) so there's never ambiguity about
// what it extended from.
export async function extendClinicTrial(clinicId: string, trialEndsAt: Date): Promise<ExtendClinicTrialResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("extend_clinic_trial", {
    p_clinic_id: clinicId,
    p_trial_ends_at: trialEndsAt.toISOString(),
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return { id: row.id, trialEndsAt: row.trial_ends_at };
}

// Shared by both actions above — same rejection shape either RPC can
// raise (session/superadmin/clinic-not-found), same tone as
// friendlyProvisionError()/friendlyProvisionAdminError() elsewhere in
// this feature.
export function friendlyClinicCommercialStatusError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    if (message.includes("session")) {
      return "Tu sesión expiró. Recarga la página e inicia sesión de nuevo para continuar.";
    }
    if (message.includes("superadmin")) {
      return "No tienes permisos de Superadmin para cambiar el estado comercial de esta clínica.";
    }
    if (message.includes("clinic not found")) {
      return "No encontramos esta clínica. Recarga la página e intenta de nuevo.";
    }
  }
  return "No pudimos actualizar el estado comercial. Intenta de nuevo en unos minutos.";
}
