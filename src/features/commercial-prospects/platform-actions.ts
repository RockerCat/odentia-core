import { createClient } from "@/lib/supabase/client";
import type { CommercialProspectStatus } from "./state-machine";

const GENERIC_ERROR = "No pudimos actualizar el estado. Intenta de nuevo.";

export type UpdateCommercialProspectStatusOutcome =
  | { status: "ok"; newStatus: CommercialProspectStatus }
  | { status: "error"; message: string };

// The one sanctioned mutation path: update_commercial_prospect_status()
// (supabase/migrations/20260916200000_create_update_commercial_prospect_status_rpc.sql)
// — Superadmin-gated, re-validates the transition against the real
// current row server-side, and touches only status/updated_at. Never a
// generic UPDATE from the browser.
export async function updateCommercialProspectStatus(
  prospectId: string,
  newStatus: CommercialProspectStatus,
): Promise<UpdateCommercialProspectStatusOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_commercial_prospect_status", {
    p_prospect_id: prospectId,
    p_new_status: newStatus,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "Solo un Superadmin de Platform puede cambiar el estado de un prospecto." };
    }
    if (error.message.includes("invalid status transition")) {
      return { status: "error", message: "Ese cambio de estado no es válido desde el estado actual." };
    }
    if (error.message.includes("prospect not found")) {
      return { status: "error", message: "No encontramos este prospecto." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  return { status: "ok", newStatus: data as CommercialProspectStatus };
}
