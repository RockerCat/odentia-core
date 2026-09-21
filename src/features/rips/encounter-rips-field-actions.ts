"use server";

import { canEditClinicalData } from "@/features/patients/clinical-permissions";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";
import { fetchEncounterRipsFieldGapContext, type EncounterRipsFieldGapContext } from "./encounter-rips-field-gap-data";

// RIPS — the two Server Actions CompleteEncounterRipsFieldModal needs, to
// fill a historical finalized encounter's missing finalidad_code/(for a
// consultation) causa_motivo_code (SERVICE_FINALIDAD_MISSING/
// CONSULTATION_CAUSA_MOTIVO_MISSING, export-readiness.ts). Two real
// callers today: `/rips` (Clinic Admin only, unchanged) and Historia
// Clínica's own Atenciones tab (Clinic Admin + Dentist — see
// atenciones-tab.tsx).
//
// Two different, deliberately DIFFERENT gates here, matching this task's
// own "UI gating = UX, RPC authorization = security" split:
//   - fetchEncounterRipsFieldGapContextAction: `clinic_admin` OR
//     `dentist` — the two roles that actually have a real surface to open
//     this modal from today (never `assistant` — no consumer needs it,
//     and CLAUDE.md never gives Assistant clinical-write authority
//     anyway). This is a minimum-privilege READ gate, not the write
//     boundary: the data it returns (patient name, encounter date,
//     per-service CUPS/type/current values) is no more sensitive than
//     what both callers' own surfaces already show that same role
//     elsewhere. A purely administrative `clinic_admin` (no
//     professional_profile) still passes this READ gate — so the
//     blocker is never hidden from her on `/rips`, same as before — but
//     `canCorrect` (canEditClinicalData(), the real, DB-backed
//     is_active_clinical_professional() mirror already used elsewhere in
//     this codebase, src/features/patients/clinical-permissions.ts) is
//     what actually decides whether she can act on it. Never a
//     role-name/localStorage guess.
//   - correctEncounterServiceRipsFieldAction: pre-checks the SAME
//     canEditClinicalData() as a fast, friendly error (never the sole
//     boundary) before ever calling the RPC — the RPC
//     (correct_encounter_service_rips_field, re-deriving
//     is_active_clinical_professional() itself server-side) is the real
//     authorization boundary either way, unchanged by this widening.
const GENERIC_ERROR = "No pudimos completar la operación. Intenta de nuevo.";

export type EncounterRipsFieldGapContextOutcome =
  | { status: "ok"; context: EncounterRipsFieldGapContext; canCorrect: boolean }
  | { status: "error"; message: string };

export async function fetchEncounterRipsFieldGapContextAction(encounterId: string): Promise<EncounterRipsFieldGapContextOutcome> {
  if (typeof encounterId !== "string" || encounterId.trim() === "") {
    return { status: "error", message: "Atención inválida." };
  }

  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") {
    return { status: "error", message: "No pudimos verificar tu sesión. Vuelve a iniciar sesión." };
  }
  if (context.membership.role !== "clinic_admin" && context.membership.role !== "dentist") {
    return { status: "error", message: "No tienes permiso para ver esta corrección." };
  }

  const gapContext = await fetchEncounterRipsFieldGapContext(supabase, context.clinic.id, encounterId);
  if (!gapContext) {
    return { status: "error", message: "No pudimos cargar la información de esta atención. Recarga la página." };
  }
  return { status: "ok", context: gapContext, canCorrect: canEditClinicalData(context) };
}

export type CorrectEncounterServiceRipsFieldInput = {
  serviceId: string;
  field: "finalidad_code" | "causa_motivo_code";
  value: string;
};

export type CorrectEncounterServiceRipsFieldOutcome =
  | { status: "ok"; finalidadCode: string | null; causaMotivoCode: string | null }
  | { status: "error"; message: string };

function mapCorrectionError(message: string): string {
  if (message.includes("service not found")) return "No encontramos ese servicio.";
  if (message.includes("only an active clinical professional")) {
    return "Esta corrección requiere ser un profesional clínico activo de la clínica.";
  }
  if (message.includes("only applies to a finalized encounter")) return "Esta corrección solo aplica a atenciones ya finalizadas.";
  if (message.includes("unsupported field")) return "Campo inválido.";
  if (message.includes("only applies to a consultation")) return "La causa/motivo solo aplica a una consulta.";
  if (message.includes("is already set for service")) {
    return "Este dato ya estaba registrado para este servicio. Esta corrección solo completa información faltante.";
  }
  if (message.includes("a value is required")) return "Selecciona un valor.";
  if (message.includes("is not an active code")) return "Selecciona un valor válido del catálogo oficial.";
  if (message.includes("was set concurrently")) return "Alguien más ya corrigió este dato. Recarga la página.";
  return GENERIC_ERROR;
}

export async function correctEncounterServiceRipsFieldAction(
  input: CorrectEncounterServiceRipsFieldInput,
): Promise<CorrectEncounterServiceRipsFieldOutcome> {
  if (typeof input.serviceId !== "string" || input.serviceId.trim() === "") {
    return { status: "error", message: "Servicio inválido." };
  }
  if (input.field !== "finalidad_code" && input.field !== "causa_motivo_code") {
    return { status: "error", message: "Campo inválido." };
  }
  if (typeof input.value !== "string" || input.value.trim() === "") {
    return { status: "error", message: "Selecciona un valor." };
  }

  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") {
    return { status: "error", message: "No pudimos verificar tu sesión. Vuelve a iniciar sesión." };
  }
  // Fast, friendly pre-check only — never the real boundary. A clinic_admin
  // with no active professional_profile (or a role that was never
  // eligible to begin with) is stopped here before even reaching the RPC,
  // same as the honest disabled state the modal itself already shows her.
  if (!canEditClinicalData(context)) {
    return { status: "error", message: "Esta corrección requiere ser un profesional clínico activo de la clínica." };
  }

  const { data, error } = await supabase.rpc("correct_encounter_service_rips_field", {
    p_service_id: input.serviceId,
    p_field: input.field,
    p_value: input.value,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "Esta corrección requiere ser un profesional clínico activo de la clínica." };
    }
    return { status: "error", message: mapCorrectionError(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { status: "ok", finalidadCode: row?.finalidad_code ?? null, causaMotivoCode: row?.causa_motivo_code ?? null };
}
