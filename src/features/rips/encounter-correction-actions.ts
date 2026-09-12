"use server";

import { mapClinicalEncounterRow, type ClinicalEncounterRecord } from "@/features/patients/clinical-encounters-data";
import { requireClinicAdminContext } from "./export-actions";
import { createClient } from "@/lib/supabase/server";

// RIPS "Corregir" flow (see this task's own report) — the ONLY write path
// for the two gaps readiness can flag on an already-finalized encounter
// (ENCOUNTER_INCAPACITY_MISSING/SERVICE_VALUE_MISSING, see
// export-readiness.ts) without reopening the full clinical encounter
// screen. Calls correct_finalized_encounter_rips_gaps (see this task's own
// migration) — a deliberately narrow RPC that can only fill a currently
// NULL incapacity_code/service_value, never overwrite an already-set one.
// Same clinic_admin-only gate as every other /rips action
// (requireClinicAdminContext) — NOT is_active_clinical_professional(),
// see the migration's own comment on why that would be the wrong gate
// here.

export type CorrectEncounterRipsGapsInput = {
  encounterId: string;
  incapacityCode?: string | null;
  serviceCorrections?: { serviceId: string; serviceValue: number }[];
};

export type CorrectEncounterRipsGapsOutcome =
  | { status: "ok"; encounter: ClinicalEncounterRecord }
  | { status: "error"; message: string };

function mapCorrectionError(message: string): string {
  if (message.includes("encounter not found")) return "No encontramos esa atención.";
  if (message.includes("not finalized yet")) return "Esta atención todavía no está finalizada.";
  if (message.includes("incapacity_code is already set")) return "La incapacidad de esta atención ya estaba registrada.";
  if (message.includes("does not exist in the official LstSiNo catalog")) return "Selecciona un valor válido para incapacidad.";
  if (message.includes("does not belong to this encounter")) return "Ese servicio no pertenece a esta atención.";
  if (message.includes("only apply to a consultation")) return "El valor cobrado solo aplica a una consulta.";
  if (message.includes("service_value is already set")) return "El valor cobrado de ese servicio ya estaba registrado.";
  if (message.includes("must be a non-negative number")) return "El valor cobrado debe ser un número mayor o igual a 0.";
  return "No pudimos guardar la corrección. Intenta de nuevo.";
}

export async function correctFinalizedEncounterRipsGapsAction(
  input: CorrectEncounterRipsGapsInput,
): Promise<CorrectEncounterRipsGapsOutcome> {
  const auth = await requireClinicAdminContext();
  if (auth.status === "error") return auth;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("correct_finalized_encounter_rips_gaps", {
    p_encounter_id: input.encounterId,
    p_incapacity_code: input.incapacityCode ?? null,
    p_service_corrections: (input.serviceCorrections ?? []).map((s) => ({ service_id: s.serviceId, service_value: s.serviceValue })),
  });

  if (error) {
    // TEMPORARY diagnostic instrumentation — server-side console only,
    // never returned to the client. Remove once the "No pudimos guardar
    // la corrección" root cause is confirmed. Logs only the Postgres/
    // PostgREST error shape (code/message/details/hint) — no token,
    // cookie, or row data.
    console.error("[correct_finalized_encounter_rips_gaps] rpc error", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para corregir esta atención." };
    }
    return { status: "error", message: mapCorrectionError(error.message) };
  }

  return { status: "ok", encounter: mapClinicalEncounterRow(data) };
}
