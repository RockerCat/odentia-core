"use server";

import { fetchRipsExportRawData, toEncounterReadinessInputs, toExportReadinessLocations, toExportReadinessPatients, toGeneratorInput } from "./export-data";
import { getPeriodLabel, type RipsExportPeriod } from "./export-datetime";
import { buildRipsSinFacturaTransaction, getRipsExportFilename, serializeRipsSinFacturaTransaction } from "./export-generator";
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

async function requireClinicAdminContext(): Promise<{ status: "ok"; clinicId: string } | { status: "error"; message: string }> {
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

export type GenerateRipsExportOutcome = { status: "ok"; filename: string; json: string } | { status: "error"; message: string; readiness?: RipsReadinessResult };

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

  const patientCount = new Set(raw.encounters.map((e) => e.patientId)).size;
  const consultationCount = raw.encounters.reduce((sum, e) => sum + e.services.filter((s) => s.ripsServiceType === "consultation").length, 0);
  const procedureCount = raw.encounters.reduce((sum, e) => sum + e.services.filter((s) => s.ripsServiceType === "procedure").length, 0);

  // Traceability only (this task's own Section 23) — never blocks the
  // download if the log write itself fails (e.g. migration not yet live
  // in an environment), same "audit-only, never load-bearing" convention
  // as this codebase's other non-critical logging calls.
  try {
    await supabase.rpc("log_rips_export", {
      p_period_year: period.year,
      p_period_month: period.month,
      p_patient_count: patientCount,
      p_consultation_count: consultationCount,
      p_procedure_count: procedureCount,
    });
  } catch (error) {
    console.error("[rips/export-actions] log_rips_export failed (non-blocking)", error);
  }

  return { status: "ok", filename: getRipsExportFilename(period), json };
}
