"use server";

import { canEditClinicalData } from "@/features/patients/clinical-permissions";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";
import {
  fetchEncounterPrincipalDiagnosisGapContext,
  type EncounterPrincipalDiagnosisGapContext,
} from "./encounter-principal-diagnosis-gap-data";

// The two Server Actions CompleteEncounterPrincipalDiagnosisModal needs,
// to add a missing principal diagnosis to a historical FINALIZED
// encounter (ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING, export-readiness.ts).
// Exact same shape/reasoning as encounter-rips-field-actions.ts
// (Finalidad/Causa): two real callers today, `/rips` (Clinic Admin only)
// and Historia Clínica's own Atenciones tab (Clinic Admin + Dentist).
//
//   - fetchEncounterPrincipalDiagnosisGapContextAction: `clinic_admin` OR
//     `dentist` — a minimum-privilege READ gate (never `assistant` — no
//     real consumer needs it). The data it returns (patient name,
//     encounter date, service list) is no more sensitive than what both
//     callers' own surfaces already show that same role elsewhere.
//   - addMissingFinalizedEncounterPrincipalDiagnosisAction: pre-checks
//     canEditClinicalData() as a fast, friendly error (never the sole
//     boundary) before ever calling the RPC — the RPC
//     (add_missing_finalized_encounter_principal_diagnosis, re-deriving
//     is_active_clinical_professional() itself server-side) is the real
//     authorization boundary either way.
const GENERIC_ERROR = "No pudimos completar la operación. Intenta de nuevo.";

export type EncounterPrincipalDiagnosisGapContextOutcome =
  | { status: "ok"; context: EncounterPrincipalDiagnosisGapContext; canCorrect: boolean }
  | { status: "error"; message: string };

export async function fetchEncounterPrincipalDiagnosisGapContextAction(
  encounterId: string,
): Promise<EncounterPrincipalDiagnosisGapContextOutcome> {
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

  const gapContext = await fetchEncounterPrincipalDiagnosisGapContext(supabase, context.clinic.id, encounterId);
  if (!gapContext) {
    return { status: "error", message: "No pudimos cargar la información de esta atención. Recarga la página." };
  }
  return { status: "ok", context: gapContext, canCorrect: canEditClinicalData(context) };
}

export type AddMissingPrincipalDiagnosisInput = {
  encounterId: string;
  cie10Code: string;
  diagnosisTypeCode: string | null;
};

export type AddMissingPrincipalDiagnosisOutcome =
  | { status: "ok"; id: string; sequence: number; cie10Code: string; diagnosisTypeCode: string | null }
  | { status: "error"; message: string };

function mapCorrectionError(message: string): string {
  if (message.includes("encounter not found")) return "No encontramos esa atención.";
  if (message.includes("only an active clinical professional")) {
    return "Esta corrección requiere ser un profesional clínico activo de la clínica.";
  }
  if (message.includes("only applies to a finalized encounter")) return "Esta corrección solo aplica a atenciones ya finalizadas.";
  if (message.includes("already has a principal diagnosis")) {
    return "Esta atención ya tiene un diagnóstico principal. Esta corrección solo completa uno faltante.";
  }
  if (message.includes("cie10_code is required")) return "Selecciona un diagnóstico.";
  if (message.includes("CIE10 catalog")) return "Selecciona un diagnóstico válido del catálogo oficial.";
  if (message.includes("RIPSTipoDiagnosticoPrincipalVersion2")) return "Selecciona un tipo de diagnóstico válido del catálogo oficial.";
  return GENERIC_ERROR;
}

export async function addMissingFinalizedEncounterPrincipalDiagnosisAction(
  input: AddMissingPrincipalDiagnosisInput,
): Promise<AddMissingPrincipalDiagnosisOutcome> {
  if (typeof input.encounterId !== "string" || input.encounterId.trim() === "") {
    return { status: "error", message: "Atención inválida." };
  }
  if (typeof input.cie10Code !== "string" || input.cie10Code.trim() === "") {
    return { status: "error", message: "Selecciona un diagnóstico." };
  }

  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") {
    return { status: "error", message: "No pudimos verificar tu sesión. Vuelve a iniciar sesión." };
  }
  // Fast, friendly pre-check only — never the real boundary.
  if (!canEditClinicalData(context)) {
    return { status: "error", message: "Esta corrección requiere ser un profesional clínico activo de la clínica." };
  }

  const { data, error } = await supabase.rpc("add_missing_finalized_encounter_principal_diagnosis", {
    p_encounter_id: input.encounterId,
    p_cie10_code: input.cie10Code,
    p_diagnosis_type_code: input.diagnosisTypeCode,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "Esta corrección requiere ser un profesional clínico activo de la clínica." };
    }
    return { status: "error", message: mapCorrectionError(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) return { status: "error", message: GENERIC_ERROR };
  return {
    status: "ok",
    id: row.id,
    sequence: row.sequence,
    cie10Code: row.cie10_code ?? input.cie10Code,
    diagnosisTypeCode: row.diagnosis_type_code ?? null,
  };
}
