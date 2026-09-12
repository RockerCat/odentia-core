"use server";

import { fetchRipsExportRawData, toEncounterReadinessInputs, toExportReadinessLocations, toExportReadinessPatients, toGeneratorInput } from "./export-data";
import { getPeriodLabel, type RipsExportPeriod } from "./export-datetime";
import { buildRipsSinFacturaTransaction, getRipsExportFilename, serializeRipsSinFacturaTransaction } from "./export-generator";
import { computeRipsExportContentHash } from "./export-hash";
import { getRipsExportReadiness, type RipsReadinessResult } from "./export-readiness";
import { validateRipsSinFacturaTransaction } from "./export-schema";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// RIPS #5 — the only two entry points a Client Component needs. Both
// independently re-resolve the real clinic context and re-check
// role === 'clinic_admin' server-side (Section 36's own conservative
// preference: clinic_admin only for V1 — dentist/assistant get a plain,
// friendly refusal, never a partial/degraded view) — never trusting a
// hidden button or a stale client-side role check alone, same convention
// as every other real mutation in this codebase.

export type RipsPeriodSummary = {
  period: RipsExportPeriod;
  periodLabel: string;
  encounterCount: number;
  patientCount: number;
  consultationCount: number;
  procedureCount: number;
  readiness: RipsReadinessResult;
};

export type RipsPeriodSummaryOutcome = { status: "ok"; summary: RipsPeriodSummary } | { status: "error"; message: string };

// Exported for encounter-correction-actions.ts (the RIPS "Corregir" flow
// for a finalized encounter's own incapacidad/valor cobrado gaps) — same
// clinic_admin-only gate every other RIPS action already re-checks
// server-side, never duplicated.
export async function requireClinicAdminContext(): Promise<{ status: "ok"; clinicId: string } | { status: "error"; message: string }> {
  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") {
    return { status: "error", message: "No pudimos verificar tu sesión. Vuelve a iniciar sesión." };
  }
  if (context.membership.role !== "clinic_admin") {
    return { status: "error", message: "Solo un Administrador de Clínica puede generar el RIPS." };
  }
  return { status: "ok", clinicId: context.clinic.id };
}

export async function getRipsPeriodSummaryAction(period: RipsExportPeriod): Promise<RipsPeriodSummaryOutcome> {
  const auth = await requireClinicAdminContext();
  if (auth.status === "error") return auth;

  const supabase = await createClient();
  let raw;
  try {
    raw = await fetchRipsExportRawData(supabase, auth.clinicId, period);
  } catch {
    return { status: "error", message: "No pudimos cargar los datos del período. Intenta de nuevo." };
  }

  const readiness = getRipsExportReadiness({
    clinicTaxId: raw.clinicTaxId,
    locations: toExportReadinessLocations(raw),
    patients: toExportReadinessPatients(raw),
    encounters: toEncounterReadinessInputs(raw),
  });

  const patientCount = new Set(raw.encounters.map((e) => e.patientId)).size;
  const consultationCount = raw.encounters.reduce((sum, e) => sum + e.services.filter((s) => s.ripsServiceType === "consultation").length, 0);
  const procedureCount = raw.encounters.reduce((sum, e) => sum + e.services.filter((s) => s.ripsServiceType === "procedure").length, 0);

  return {
    status: "ok",
    summary: {
      period,
      periodLabel: getPeriodLabel(period),
      encounterCount: raw.encounters.length,
      patientCount,
      consultationCount,
      procedureCount,
      readiness,
    },
  };
}

export type GenerateRipsExportOutcome =
  | { status: "ok"; filename: string; json: string; exportId: string | null; contentHash: string }
  | { status: "error"; message: string; readiness?: RipsReadinessResult };

export async function generateRipsSinFacturaExportAction(period: RipsExportPeriod): Promise<GenerateRipsExportOutcome> {
  const auth = await requireClinicAdminContext();
  if (auth.status === "error") return auth;

  const supabase = await createClient();
  let raw;
  try {
    raw = await fetchRipsExportRawData(supabase, auth.clinicId, period);
  } catch {
    return { status: "error", message: "No pudimos cargar los datos del período. Intenta de nuevo." };
  }

  // Re-checked here, never trusted from an earlier summary call — data
  // may have changed since the screen last loaded (this task's own "no
  // generar un JSON parcialmente inválido").
  const readiness = getRipsExportReadiness({
    clinicTaxId: raw.clinicTaxId,
    locations: toExportReadinessLocations(raw),
    patients: toExportReadinessPatients(raw),
    encounters: toEncounterReadinessInputs(raw),
  });
  if (!readiness.ready) {
    return { status: "error", message: "Hay pendientes por corregir antes de generar el RIPS.", readiness };
  }
  if (raw.encounters.length === 0) {
    return { status: "error", message: "No hay atenciones elegibles en este período." };
  }

  // readiness.ready guarantees exactly one location with a codPrestador —
  // see getRipsExportReadiness's own LOCATION_AMBIGUOUS/LOCATION_MISSING
  // checks, which would have blocked otherwise.
  const location = raw.locations[0]!;
  const input = toGeneratorInput(raw, raw.clinicTaxId!, { codPrestador: location.codPrestador!, timezone: location.timezone });
  const { transaction } = buildRipsSinFacturaTransaction(input);

  // Runtime structural validation (this task's own RIPS #5A) — the LAST
  // gate before serialization/download. TypeScript types vanish at
  // runtime; this is what actually catches a malformed DTO (a generator
  // regression, an unexpected DB value) before it ever becomes a
  // downloadable file. Never logs the transaction itself — only error
  // paths/messages, which reference field names and rules, never values
  // (this transaction carries protected health information).
  const schemaResult = validateRipsSinFacturaTransaction(transaction);
  if (!schemaResult.valid) {
    console.error(
      `[rips/export-actions] generated transaction failed runtime schema validation (${schemaResult.errors.length} error(s)): ` +
        schemaResult.errors
          .slice(0, 10)
          .map((e) => `${e.path}: ${e.message}`)
          .join("; "),
    );
    return { status: "error", message: "No pudimos generar un RIPS válido. Contacta soporte — este es un problema interno, no un dato faltante." };
  }

  const json = serializeRipsSinFacturaTransaction(transaction);
  // RIPS #5B — hashed from this EXACT string, the same one returned below
  // for download. Never recomputed from a re-serialized transaction, so
  // the logged fingerprint can never silently diverge from the bytes the
  // odontóloga actually uploads to the MUV (see export-hash.ts).
  const contentHash = computeRipsExportContentHash(json);

  const patientCount = new Set(raw.encounters.map((e) => e.patientId)).size;
  const consultationCount = raw.encounters.reduce((sum, e) => sum + e.services.filter((s) => s.ripsServiceType === "consultation").length, 0);
  const procedureCount = raw.encounters.reduce((sum, e) => sum + e.services.filter((s) => s.ripsServiceType === "procedure").length, 0);

  // Traceability only (this task's own Section 23) — never blocks the
  // download if the log write itself fails (e.g. migration not yet live
  // in an environment), same "audit-only, never load-bearing" convention
  // as this codebase's other non-critical logging calls. exportId stays
  // null in that case — the download still succeeds, but this generation
  // won't be selectable later for a manual MUV result (there is nothing
  // to attach it to).
  let exportId: string | null = null;
  try {
    const { data, error } = await supabase.rpc("log_rips_export", {
      p_period_year: period.year,
      p_period_month: period.month,
      p_patient_count: patientCount,
      p_consultation_count: consultationCount,
      p_procedure_count: procedureCount,
      p_content_hash: contentHash,
    });
    if (error) throw error;
    exportId = data?.id ?? null;
  } catch (error) {
    console.error("[rips/export-actions] log_rips_export failed (non-blocking)", error);
  }

  return { status: "ok", filename: getRipsExportFilename(period), json, exportId, contentHash };
}

// ---------------------------------------------------------------------
// RIPS #5B — pilot-validation traceability. Odentia never connects to
// SISPRO/MUV (see RIPS #6A's own PASS WITH ISSUES): everything below only
// records what a human typed in AFTER performing the real manual upload
// themselves, or reads back what Odentia itself already generated.
// ---------------------------------------------------------------------

export type RipsExportResultStatus = "generated" | "accepted" | "rejected";

export type RipsExportHistoryEntry = {
  id: string;
  period: RipsExportPeriod;
  periodLabel: string;
  generatedAt: string;
  patientCount: number;
  consultationCount: number;
  procedureCount: number;
  contentHash: string | null;
  resultStatus: RipsExportResultStatus;
  muvProcesoId: string | null;
  muvCuv: string | null;
  muvRadicacionAt: string | null;
  muvResultNotes: string | null;
  resultRecordedAt: string | null;
};

export type RipsExportHistoryOutcome = { status: "ok"; entries: RipsExportHistoryEntry[] } | { status: "error"; message: string };

// Most recent first, capped — this is a small traceability list for one
// clinic's own pilot, never an administrative screen (this task's own
// Section 15 "no hacer una pantalla administrativa enorme").
const EXPORT_HISTORY_LIMIT = 20;

export async function getRipsExportHistoryAction(): Promise<RipsExportHistoryOutcome> {
  const auth = await requireClinicAdminContext();
  if (auth.status === "error") return auth;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rips_export_log")
    .select(
      "id, period_year, period_month, generated_at, patient_count, consultation_count, procedure_count, content_hash, result_status, muv_proceso_id, muv_cuv, muv_radicacion_at, muv_result_notes, result_recorded_at",
    )
    .eq("clinic_id", auth.clinicId)
    .order("generated_at", { ascending: false })
    .limit(EXPORT_HISTORY_LIMIT);

  if (error) return { status: "error", message: "No pudimos cargar el historial de RIPS." };

  return {
    status: "ok",
    entries: (data ?? []).map((row) => ({
      id: row.id,
      period: { year: row.period_year, month: row.period_month },
      periodLabel: getPeriodLabel({ year: row.period_year, month: row.period_month }),
      generatedAt: row.generated_at,
      patientCount: row.patient_count,
      consultationCount: row.consultation_count,
      procedureCount: row.procedure_count,
      contentHash: row.content_hash,
      resultStatus: row.result_status as RipsExportResultStatus,
      muvProcesoId: row.muv_proceso_id,
      muvCuv: row.muv_cuv,
      muvRadicacionAt: row.muv_radicacion_at,
      muvResultNotes: row.muv_result_notes,
      resultRecordedAt: row.result_recorded_at,
    })),
  };
}

// Deliberately a discriminated union, not one flat "everything optional"
// shape — an accepted result requires a CUV, a rejected one requires
// notes, and TypeScript itself should refuse to build a call site that
// mixes them up (this task's own Section 10 "no pedir que copie 100
// campos" — each branch only carries what that outcome actually needs).
export type RecordRipsExportResultInput =
  | { exportId: string; result: "accepted"; procesoId?: string; cuv: string; radicacionAt?: string }
  | { exportId: string; result: "rejected"; notes: string };

export type RecordRipsExportResultOutcome = { status: "ok" } | { status: "error"; message: string };

export async function recordRipsExportResultAction(input: RecordRipsExportResultInput): Promise<RecordRipsExportResultOutcome> {
  const auth = await requireClinicAdminContext();
  if (auth.status === "error") return auth;

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_rips_export_result", {
    p_export_id: input.exportId,
    p_result_status: input.result,
    p_muv_proceso_id: input.result === "accepted" ? (input.procesoId?.trim() || null) : null,
    p_muv_cuv: input.result === "accepted" ? input.cuv.trim() : null,
    p_muv_radicacion_at: input.result === "accepted" ? input.radicacionAt || null : null,
    p_muv_result_notes: input.result === "rejected" ? input.notes.trim() : null,
  });

  if (error) {
    if (error.code === "55000") return { status: "error", message: "Este archivo ya tiene un resultado registrado y no puede modificarse." };
    if (error.code === "23514") return { status: "error", message: "Falta información obligatoria para registrar este resultado." };
    if (error.code === "42501") return { status: "error", message: "No tienes permiso para registrar este resultado." };
    return { status: "error", message: "No pudimos registrar el resultado. Intenta de nuevo." };
  }
  return { status: "ok" };
}
