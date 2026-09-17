"use server";

import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// RIPS #A4 — the ONE write path for clinic_specialty_rips_services. Wraps
// confirm_clinic_specialty_rips_service() (SECURITY DEFINER,
// 20260917100000_create_confirm_clinic_specialty_rips_service_rpc.sql),
// which re-resolves the caller's own active clinic_admin membership and
// re-validates the Servicio/Grupo pair against the official catalog
// itself, entirely server-side — this action never sends a clinic_id
// (there is no such parameter to send) and never duplicates that
// validation here. Only basic input shape is checked before calling out;
// every real rule (role, catalog membership, Grupo/Servicio consistency,
// supersede) lives in the RPC/DB.
//
// Same "use server" + resolveClinicContext + clinic_admin-only shape as
// src/features/rips/export-actions.ts's own requireClinicAdminContext() —
// deliberately re-derived locally here rather than imported cross-feature
// from rips/export-actions.ts (a Clínica-settings write, not a RIPS
// export one — same rule restated in the module it actually belongs to).
//
// No return payload beyond ok/error: the caller (rips-specialty-services-section.tsx)
// already has the Grupo/Servicio codes it just selected from its own
// already-loaded catalog options — on "ok" those are exactly what the RPC
// just persisted (an error here would have short-circuited before ever
// reaching this point), so there is nothing further to echo back.
const GENERIC_ERROR = "No pudimos guardar la configuración. Intenta de nuevo.";

export type ConfirmSpecialtyRipsServiceOutcome = { status: "ok" } | { status: "error"; message: string };

export async function confirmClinicSpecialtyRipsServiceAction(
  specialtyId: string,
  ripsReferenceValueId: string,
): Promise<ConfirmSpecialtyRipsServiceOutcome> {
  if (typeof specialtyId !== "string" || specialtyId.trim() === "") {
    return { status: "error", message: "Selecciona una especialidad válida." };
  }
  if (typeof ripsReferenceValueId !== "string" || ripsReferenceValueId.trim() === "") {
    return { status: "error", message: "Selecciona un Servicio RIPS válido." };
  }

  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") {
    return { status: "error", message: "No pudimos verificar tu sesión. Vuelve a iniciar sesión." };
  }
  if (context.membership.role !== "clinic_admin") {
    return { status: "error", message: "Solo un Administrador de Clínica puede confirmar esta configuración." };
  }

  const { error } = await supabase.rpc("confirm_clinic_specialty_rips_service", {
    p_specialty_id: specialtyId,
    p_rips_reference_value_id: ripsReferenceValueId,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "Solo un Administrador de Clínica activo puede confirmar esta configuración." };
    }
    if (error.message.includes("inactive specialty")) {
      return { status: "error", message: "Esta especialidad ya no está activa." };
    }
    if (error.message.includes("specialty not found")) {
      return { status: "error", message: "Esta especialidad ya no está disponible. Recarga la página." };
    }
    if (error.message.includes("Servicio not found")) {
      return { status: "error", message: "Selecciona un Servicio RIPS válido del catálogo oficial." };
    }
    if (error.message.includes("Grupo de servicios") || error.message.includes("has no Grupo")) {
      return { status: "error", message: "Ese Servicio no tiene un Grupo de servicios válido en el catálogo oficial." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  return { status: "ok" };
}
