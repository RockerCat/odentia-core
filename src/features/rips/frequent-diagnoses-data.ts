import { createClient } from "@/lib/supabase/server";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { findDiagnosesByCodes, type DiagnosisCode } from "./catalog-data";

// RIPS #A3 UX gap: Diagnóstico principal/relacionado's own CIE-10 search
// (searchDiagnosesAction, catalog-data.ts) shows nothing until the
// odontólogo types 2+ characters — there's no way to discover a diagnosis
// without already knowing its code or name. This is the one, narrow,
// tenant-scoped exception: "diagnoses THIS clinic has actually already
// used", read straight from encounter_diagnoses (the real usage log) —
// never a curated/hardcoded clinical list, never inferred from a CUPS/
// concept/specialty, and never a cross-clinic suggestion.
//
// Deliberately NOT a new table, materialized view, or denormalized usage
// counter: encounter_diagnoses already IS the source of truth. A bounded,
// most-recent window (DIAGNOSIS_HISTORY_WINDOW rows) is aggregated here
// in memory — simple, safe against unbounded growth over years, and
// naturally recency-biased (this task's own stated priority: tenant
// safety > real frequency > simple implementation, in that order) without
// a raw SQL aggregate or a new RPC.
//
// A later UX pass wanted this list padded up to FREQUENT_DIAGNOSES_LIMIT
// with "common odontológico" suggestions from the CIE-10 catalog whenever
// a clinic has fewer than that many real frequent codes. That fallback
// was deliberately NOT built: `diagnosis_catalog.chapter`/`category` are
// optional import columns (see docs/rips-catalogs.md §6) and nothing in
// this repo confirms the loaded CIE-10 import actually populated them
// with a machine-readable "oral cavity" classification, a direct
// read-only check against the real table was blocked by this
// environment's own production-read safety guard, and no other mechanism
// in the codebase maps a CIE-10 code/chapter to "common dental diagnosis"
// today. Filtering by a hardcoded code range (e.g. K00–K14) would be
// introducing new clinical semantics Odentia's data model doesn't
// actually encode anywhere — exactly what this file's own header above
// already refuses to do for the real-usage list. Revisit only once
// chapter/category population is verified (or a clinic/specialty-scoped
// "common diagnoses" concept is deliberately added elsewhere first).
const DIAGNOSIS_HISTORY_WINDOW = 500;
// Diagnóstico principal's own initial-suggestions UI (see
// real-clinical-encounter-screen.tsx's DIAGNOSIS_INITIAL_SUGGESTIONS) is
// meant to show at most 5 options on focus — exported so that cap is
// pinned by a real test, not just implied by call-site behavior.
export const FREQUENT_DIAGNOSES_LIMIT = 5;

export type FrequentDiagnosesResult =
  | { status: "ok"; diagnoses: DiagnosisCode[] }
  // Distinguishes "this clinic genuinely has no usable history yet" from
  // "not authorized" — the UI needs to tell those apart (a helpful hint
  // vs. simply showing nothing), never conflating them.
  | { status: "no-history" }
  | { status: "unauthorized" };

// Pure — no Supabase import, same convention as this codebase's other
// RIPS decision logic (clinical-service-resolution.ts, export-readiness.ts):
// independently unit-testable without mocking the DB. Frequency first,
// most-recent-use as the tiebreaker, capped at `limit` — exactly the
// order this task asked for. Input is already scoped to one clinic by the
// caller (see fetchFrequentDiagnosesForCurrentClinic below) — this
// function has no clinic concept of its own, it only ranks rows it's
// handed.
export function rankFrequentDiagnosisCodes(rows: { cie10Code: string; createdAt: string }[], limit: number): string[] {
  const usage = new Map<string, { count: number; lastUsedAt: string }>();
  for (const row of rows) {
    const existing = usage.get(row.cie10Code);
    if (existing) {
      existing.count += 1;
      if (row.createdAt > existing.lastUsedAt) existing.lastUsedAt = row.createdAt;
    } else {
      usage.set(row.cie10Code, { count: 1, lastUsedAt: row.createdAt });
    }
  }

  return [...usage.entries()]
    .sort(([, a], [, b]) => b.count - a.count || (a.lastUsedAt < b.lastUsedAt ? 1 : -1))
    .slice(0, limit)
    .map(([code]) => code);
}

export async function fetchFrequentDiagnosesForCurrentClinic(): Promise<FrequentDiagnosesResult> {
  const supabase = await createClient();

  // clinicId is NEVER accepted as a parameter here — resolved exclusively
  // from the caller's own authenticated session, the same pattern every
  // real page/RPC in this codebase already uses for this exact reason
  // (see resolve-clinic-context.ts's own header comment). This is what
  // makes "clinic A asks for clinic B's frequent diagnoses" structurally
  // impossible, not just policy-checked — a malicious/buggy client can't
  // pass a different clinicId because there is no such parameter to pass.
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") return { status: "unauthorized" };
  const clinicId = context.clinic.id;

  // encounter_diagnoses_select_member (RLS, see 20260910160000) already
  // independently enforces this exact same clinic_id boundary — this
  // .eq() is belt-and-suspenders, matching this codebase's own convention
  // (e.g. fetchEncounterServices), never the only thing standing between
  // two clinics' data.
  const { data, error } = await supabase
    .from("encounter_diagnoses")
    .select("cie10_code, created_at")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(DIAGNOSIS_HISTORY_WINDOW);

  if (error || !data || data.length === 0) return { status: "no-history" };

  const topCodes = rankFrequentDiagnosisCodes(
    data.map((row) => ({ cie10Code: row.cie10_code, createdAt: row.created_at })),
    FREQUENT_DIAGNOSES_LIMIT,
  );

  const catalogRows = await findDiagnosesByCodes("CIE10", topCodes);
  if (catalogRows.length === 0) return { status: "no-history" };

  // findDiagnosesByCodes doesn't preserve input order (a plain `.in()`
  // doesn't guarantee it) — re-sort to the frequency/recency order
  // computed above, dropping any code that's no longer active (silently;
  // see that function's own comment).
  const byCode = new Map(catalogRows.map((row) => [row.code, row]));
  const diagnoses = topCodes.map((code) => byCode.get(code)).filter((row): row is DiagnosisCode => row !== undefined);

  return diagnoses.length > 0 ? { status: "ok", diagnoses } : { status: "no-history" };
}
