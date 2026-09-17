"use server";

import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";
import { fetchEncounterRipsServiceGapContext, type EncounterRipsServiceGapContext } from "./encounter-rips-service-gap-data";

// RIPS Fase A4B — the two Server Actions CompleteEncounterRipsServiceModal
// needs. Both independently re-resolve the real clinic context and
// re-check role === 'clinic_admin' server-side, same convention as every
// other /rips action (export-actions.ts's own requireClinicAdminContext).
//
// applyConfirmedSpecialtyRipsServiceToEncounterAction takes ONLY
// encounterId — never clinicId (resolved server-side from the caller's
// own membership before the RPC even runs, and re-derived a second time
// INSIDE the RPC itself from the encounter's own row — never trusted from
// here either), never a Grupo/Servicio code of any kind (the RPC always
// derives those itself from clinic_specialty_rips_services). There is
// nothing for a client to choose freely in this flow.

const GENERIC_ERROR = "No pudimos completar la operación. Intenta de nuevo.";

export type EncounterRipsServiceGapContextOutcome =
  | { status: "ok"; context: EncounterRipsServiceGapContext }
  | { status: "error"; message: string };

export async function fetchEncounterRipsServiceGapContextAction(
  encounterId: string,
): Promise<EncounterRipsServiceGapContextOutcome> {
  if (typeof encounterId !== "string" || encounterId.trim() === "") {
    return { status: "error", message: "Atención inválida." };
  }

  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") {
    return { status: "error", message: "No pudimos verificar tu sesión. Vuelve a iniciar sesión." };
  }
  if (context.membership.role !== "clinic_admin") {
    return { status: "error", message: "Solo un Administrador de Clínica puede corregir esto." };
  }

  const gapContext = await fetchEncounterRipsServiceGapContext(supabase, context.clinic.id, encounterId);
  if (!gapContext) {
    return { status: "error", message: "No pudimos cargar la información de esta atención. Recarga la página." };
  }
  return { status: "ok", context: gapContext };
}

export type ApplyConfirmedSpecialtyRipsServiceOutcome = { status: "ok"; updatedCount: number } | { status: "error"; message: string };

export async function applyConfirmedSpecialtyRipsServiceToEncounterAction(
  encounterId: string,
): Promise<ApplyConfirmedSpecialtyRipsServiceOutcome> {
  if (typeof encounterId !== "string" || encounterId.trim() === "") {
    return { status: "error", message: "Atención inválida." };
  }

  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") {
    return { status: "error", message: "No pudimos verificar tu sesión. Vuelve a iniciar sesión." };
  }
  if (context.membership.role !== "clinic_admin") {
    return { status: "error", message: "Solo un Administrador de Clínica puede aplicar esta corrección." };
  }

  const { data, error } = await supabase.rpc("apply_confirmed_specialty_rips_service_to_encounter", {
    p_encounter_id: encounterId,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "Solo un Administrador de Clínica activo puede aplicar esta corrección." };
    }
    if (error.message.includes("encounter not found")) {
      return { status: "error", message: "No encontramos esta atención." };
    }
    if (error.message.includes("not finalized")) {
      return { status: "error", message: "Esta corrección solo aplica a atenciones ya finalizadas." };
    }
    if (error.message.includes("no resolvable specialty")) {
      return { status: "error", message: "No pudimos determinar la especialidad de esta atención." };
    }
    if (error.message.includes("no confirmed and active Servicio RIPS")) {
      return {
        status: "error",
        message: "Esta especialidad todavía no tiene un Servicio RIPS confirmado. Configúralo en Clínica primero.",
      };
    }
    if (error.message.includes("Grupo de servicios")) {
      return {
        status: "error",
        message: "La configuración confirmada ya no es válida en el catálogo oficial. Revisa la configuración en Clínica.",
      };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { status: "ok", updatedCount: row?.updated_count ?? 0 };
}
