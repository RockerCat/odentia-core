import { createClient } from "@/lib/supabase/client";
import { mapClinicalEncounterRow, type ClinicalEncounterRecord } from "./clinical-encounters-data";

// The one sanctioned write path — always through
// upsert_patient_clinical_encounter() (see the 20260903120000 migration,
// extended by RIPS #4's 20260910160000/20260910170000), never a direct
// table INSERT/UPDATE (there is no INSERT/UPDATE policy, deliberately).
// Resolves clinic_id/attended_by itself server-side and re-checks
// is_active_clinical_professional() — this client wrapper never sends
// clinic_id or attended_by, same convention as tooth-findings-actions.ts's
// insertPatientToothFinding.
//
// Idempotent by appointmentId when one is passed (see the migration's own
// comment): the first call for a given appointmentId creates the draft row
// ("Guardar borrador"); every subsequent call — another draft save, or
// "Finalizar atención" (finalize: true) — updates that SAME row in place,
// never inserts a second one. Once a row is finalized, further calls
// return it unchanged rather than overwriting a real clinical record.
//
// procedures/diagnoses/services each replace the encounter's full list
// every call — the UI always edits the whole set client-side (add/remove/
// edit rows), so a wholesale replace (not a per-row diff) is the correct
// match, and is what the RPC actually does under the hood.

export type UpsertClinicalEncounterDiagnosisInput = {
  cie10Code: string;
  role: "principal" | "related";
  // Only meaningful for role: "principal" (RIPS #4 — C14
  // tipoDiagnosticoPrincipal, "confirmado vs presuntivo" — a different
  // concept from `role`, see the migration's own comment). The RPC itself
  // rejects a non-null value on a "related" row.
  diagnosisTypeCode: string | null;
  // Optional — scopes this diagnosis to ONE specific service (by its
  // 0-based position within THIS SAME call's `services` array) instead of
  // the whole encounter. Undefined/null (the only value this app's
  // current UI ever sends) means "applies to the whole encounter" — see
  // encounter_diagnoses.encounter_service_id's own migration comment.
  serviceSequence?: number | null;
};

export type UpsertClinicalEncounterServiceInput = {
  cupsCode: string;
  professionalProfileId: string;
  performedAt?: string | null;
  // Left undefined/null for a consultation (Odentia doesn't track the
  // amount actually paid by the patient yet — see this task's own
  // Service Value gap) — the RPC auto-fills 0 for a procedure per the
  // Documento Técnico 1's own RIPS-sin-factura rule, never for a
  // consultation.
  serviceValue?: number | null;
  viaIngresoCode?: string | null;
  modalidadCode?: string | null;
  grupoServiciosCode?: string | null;
  codServicioCode?: string | null;
  finalidadCode?: string | null;
  causaMotivoCode?: string | null;
  conceptoRecaudoCode?: string | null;
  valorPagoModerador?: number | null;
  // RIPS #A3 — snapshot del concepto clínico natural que originó este
  // servicio (ver clinical-service-resolution.ts). Undefined/null en un
  // servicio agregado por CUPS manual — nunca inventado.
  clinicalConceptId?: string | null;
  clinicalConceptVariantId?: string | null;
  clinicalConceptNameSnapshot?: string | null;
  clinicalVariantNameSnapshot?: string | null;
  mappingStatus?: "resolved" | "unresolved" | null;
};

export type UpsertClinicalEncounterInput = {
  patientId: string;
  appointmentId?: string | null;
  occurredAt: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  indications: string | null;
  procedures: { name: string; note: string | null }[];
  // RIPS #4 — U09 incapacidad (LstSiNo 01/02), a fact of THIS atención.
  incapacityCode?: string | null;
  diagnoses?: UpsertClinicalEncounterDiagnosisInput[];
  services?: UpsertClinicalEncounterServiceInput[];
  finalize?: boolean;
};

export type ClinicalEncounterOutcome =
  | { status: "ok"; encounter: ClinicalEncounterRecord }
  | { status: "error"; message: string };

// Maps the RPC's own catalog-validation exception text (see the
// migration) to a friendly, human-language message — never a raw
// regulatory error code in a clinical form (this task's own Section 24).
// Official validation-rule codes (RVCxxx) are reserved for a future
// prevalidation module, never surfaced here.
function mapEncounterValidationError(message: string): string | null {
  if (message.includes("cie10_code")) return "Selecciona un diagnóstico CIE-10 válido.";
  if (message.includes("at most one principal diagnosis")) return "Solo puede haber un diagnóstico principal.";
  if (message.includes("same cie10_code cannot be repeated")) return "Ese diagnóstico ya fue agregado.";
  if (message.includes("diagnosis_type_code only applies")) return "El tipo de diagnóstico solo aplica al diagnóstico principal.";
  if (message.includes("diagnosis_type_code")) return "Selecciona un tipo de diagnóstico válido.";
  if (message.includes("service_sequence")) return "Hubo un problema relacionando un diagnóstico con un servicio. Intenta de nuevo.";
  if (message.includes("cups_code")) return "Selecciona un servicio (CUPS) válido.";
  if (message.includes("professional_profile_id")) return "Selecciona un profesional válido de tu clínica.";
  if (message.includes("via_ingreso_code only applies")) return "La vía de ingreso solo aplica a procedimientos.";
  if (message.includes("causa_motivo_code only applies")) return "La causa del motivo de atención solo aplica a consultas.";
  if (message.includes("via_ingreso_code")) return "Selecciona una vía de ingreso válida.";
  if (message.includes("modalidad_code")) return "Selecciona una modalidad válida.";
  if (message.includes("grupo_servicios_code")) return "Selecciona un grupo de servicios válido.";
  if (message.includes("cod_servicio_code")) return "Selecciona un servicio válido.";
  if (message.includes("finalidad_code")) return "Selecciona una finalidad válida.";
  if (message.includes("causa_motivo_code")) return "Selecciona una causa de motivo de atención válida.";
  if (message.includes("concepto_recaudo_code")) return "Selecciona un concepto de recaudo válido.";
  if (message.includes("incapacity_code")) return "Selecciona un valor válido para incapacidad.";
  if (message.includes("clinical_concept_variant_id")) return "El concepto clínico seleccionado no es válido. Intenta de nuevo.";
  if (message.includes("mapping_status")) return "Hubo un problema resolviendo el concepto clínico seleccionado. Intenta de nuevo.";
  if (message.includes("clinical_concept_id")) return "El concepto clínico seleccionado no es válido. Intenta de nuevo.";
  return null;
}

export async function upsertPatientClinicalEncounter(input: UpsertClinicalEncounterInput): Promise<ClinicalEncounterOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("upsert_patient_clinical_encounter", {
    p_patient_id: input.patientId,
    p_occurred_at: input.occurredAt,
    p_reason: input.reason,
    p_diagnosis: input.diagnosis,
    p_treatment: input.treatment,
    p_notes: input.notes,
    p_indications: input.indications,
    p_procedures: input.procedures,
    p_appointment_id: input.appointmentId ?? null,
    p_finalize: input.finalize ?? false,
    p_incapacity_code: input.incapacityCode ?? null,
    p_diagnoses: (input.diagnoses ?? []).map((d) => ({
      cie10_code: d.cie10Code,
      role: d.role,
      diagnosis_type_code: d.diagnosisTypeCode,
      service_sequence: d.serviceSequence ?? null,
    })),
    p_services: (input.services ?? []).map((s) => ({
      cups_code: s.cupsCode,
      professional_profile_id: s.professionalProfileId,
      performed_at: s.performedAt ?? null,
      service_value: s.serviceValue ?? null,
      via_ingreso_code: s.viaIngresoCode ?? null,
      modalidad_code: s.modalidadCode ?? null,
      grupo_servicios_code: s.grupoServiciosCode ?? null,
      cod_servicio_code: s.codServicioCode ?? null,
      finalidad_code: s.finalidadCode ?? null,
      causa_motivo_code: s.causaMotivoCode ?? null,
      concepto_recaudo_code: s.conceptoRecaudoCode ?? null,
      valor_pago_moderador: s.valorPagoModerador ?? null,
      clinical_concept_id: s.clinicalConceptId ?? null,
      clinical_concept_variant_id: s.clinicalConceptVariantId ?? null,
      clinical_concept_name_snapshot: s.clinicalConceptNameSnapshot ?? null,
      clinical_variant_name_snapshot: s.clinicalVariantNameSnapshot ?? null,
      mapping_status: s.mappingStatus ?? null,
    })),
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para registrar esta atención." };
    }
    const ripsMessage = mapEncounterValidationError(error.message);
    if (ripsMessage) return { status: "error", message: ripsMessage };
    return { status: "error", message: "No pudimos guardar la atención. Intenta de nuevo." };
  }

  return { status: "ok", encounter: mapClinicalEncounterRow(data) };
}
