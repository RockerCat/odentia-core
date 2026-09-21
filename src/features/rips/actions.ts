"use server";

import {
  EXAMEN_ODONTOLOGICO_CODE,
  findCupsByCode,
  findDiagnosisByCode,
  findReferenceValueByCode,
  searchCups,
  searchDiagnoses,
  searchReferenceValues,
  type CupsCode,
  type DiagnosisCode,
  type ReferenceValue,
} from "./catalog-data";
import { fetchFrequentDiagnosesForCurrentClinic, type FrequentDiagnosesResult } from "./frequent-diagnoses-data";

// Resolves one already-known code (e.g. a patient's saved municipality)
// to its label — the ReferenceValueAutocomplete's own initial-label
// lookup, never a fetch of the whole catalog.
export async function findReferenceValueByCodeAction(catalogKey: string, code: string): Promise<ReferenceValue | null> {
  return findReferenceValueByCode(catalogKey, code);
}

// The one server action a Client Component needs to search a large
// reference catalog (today: Municipio, 1,124 rows — see this task's
// Performance section) without shipping the whole catalog to the browser.
// catalogKey is never accepted from anything but this project's own code
// (never a raw client string reaching the DB unchecked) — every caller is
// a specific, hardcoded catalog_key like "Municipio", same as every other
// call site of searchReferenceValues.
export async function searchReferenceValuesAction(catalogKey: string, query: string): Promise<ReferenceValue[]> {
  if (!query.trim()) return [];
  return searchReferenceValues(catalogKey, query, 20);
}

// CUPS search-as-you-type for "Servicios realizados" (RIPS #4) — by code
// or description, never the full ~13,640-row catalog shipped to the
// client (see catalog-data.ts's own comment).
export async function searchCupsAction(query: string): Promise<CupsCode[]> {
  if (!query.trim()) return [];
  return searchCups(query, 20);
}

// CIE-10 search-as-you-type for "Diagnósticos" (RIPS #4) — by code or
// description, never the full ~12,600-row catalog shipped to the client.
// `dentalOnly` (Prompt Ninja "búsqueda CIE-10 dental-first con expansión
// explícita", then "scope odontológico CIE-10 versionado") narrows to
// whatever public.diagnosis_dental_scope currently contains — the SAME
// dentalOnly this function already forwards to searchDiagnoses for
// browse, never a second/duplicated query. Omitted (or false), this is
// byte-for-byte the general search every existing caller (and CUPS,
// which never touches this function at all) already gets — a UI never
// silently narrows unless it explicitly asks to. Z012's own membership
// in that scope (seeded, not hardcoded here) is what lets typed dental
// search surface it (e.g. typing "examen") — no separate flag needed
// anymore.
export async function searchDiagnosesAction(query: string, options?: { dentalOnly?: boolean }): Promise<DiagnosisCode[]> {
  if (!query.trim()) return [];
  return searchDiagnoses("CIE10", query, 20, { dentalOnly: options?.dentalOnly });
}

// RIPS #A3 UX gap, continued (Prompt Ninja "priorizar Z012 + K00–K14 en
// selector odontológico") — the single pinned "Examen odontológico" row
// shown above the K00–K14 browse section on empty focus. Resolved
// through the real catalog exactly like every other diagnosis lookup
// (findDiagnosisByCode, already used for the "resolve a saved code's
// description" case above) — never a fabricated {code, description}
// object. Fails closed to an empty array if Z012 isn't found active in
// diagnosis_catalog (a real, if unexpected, possibility this checkpoint
// deliberately does not paper over) — the caller's own render then
// simply shows nothing for this section, same as any other empty browse
// page, rather than inventing a row.
export async function fetchExamenOdontologicoAction(): Promise<DiagnosisCode[]> {
  const row = await findDiagnosisByCode("CIE10", EXAMEN_ODONTOLOGICO_CODE);
  return row ? [row] : [];
}

// Not exported — a "use server" file may only export async functions, so
// this stays a plain module-local constant. The client's own copy (see
// code-search-autocomplete.tsx's DIAGNOSIS_BROWSE_PAGE_SIZE) must keep
// matching this number so it can tell "this was a full page, there may be
// more" apart from "this was the last page" without the server having to
// say so explicitly.
const DIAGNOSIS_BROWSE_PAGE_SIZE = 50;

// RIPS #A3 UX gap, continued (Prompt Ninja "selector CIE-10 Frecuentes →
// Odontología → Todos", then "scope odontológico CIE-10 versionado") —
// empty-focus catalog browse for Diagnóstico principal/relacionado,
// never the full ~12,634-row catalog (see docs/rips-catalogs.md and
// searchDiagnoses's own comment). `dentalOnly` narrows to
// public.diagnosis_dental_scope's current members for the "Odontología"
// section; `false` serves "Todos los diagnósticos" — same underlying
// query either way, reused via searchDiagnoses, never a second
// implementation. `offset` is what "Cargar más" advances. Never used by
// the CUPS autocomplete — diagnosis-only, same convention as
// fetchFrequentDiagnosesAction below.
export async function browseDiagnosesAction(input: { offset: number; dentalOnly: boolean }): Promise<DiagnosisCode[]> {
  return searchDiagnoses("CIE10", "", DIAGNOSIS_BROWSE_PAGE_SIZE, { offset: input.offset, dentalOnly: input.dentalOnly });
}

// RIPS #A3 UX gap — discoverability for Diagnóstico principal/relacionado:
// "diagnoses already used in the caller's OWN clinic", shown when the
// field is focused/empty (before the odontólogo has typed anything).
// clinicId is resolved entirely server-side inside
// fetchFrequentDiagnosesForCurrentClinic() — this action takes NO
// parameters, so there is nothing for a client to override. Never used by
// the CUPS autocomplete (searchCupsAction, above) — this is diagnosis-only.
export async function fetchFrequentDiagnosesAction(): Promise<FrequentDiagnosesResult> {
  return fetchFrequentDiagnosesForCurrentClinic();
}

// Resolves one already-known CUPS/CIE-10 code to its full row (used to
// show a human description for a code a form already has — e.g. a
// previously-saved encounter service/diagnosis — without a full search).
// onDate resolves the code against the catalog version in effect on that
// date (see catalog-data.ts's own findCupsByCode/findDiagnosisByCode) —
// used by the Atenciones timeline to resolve a PAST encounter's code
// against its own occurred_at, never today's date, matching how the
// write-time RPC validated it in the first place. Omitted (a fresh
// selection in the encounter screen) falls back to "currently active".
export async function findCupsByCodeAction(code: string, onDate?: string): Promise<CupsCode | null> {
  return findCupsByCode(code, onDate);
}

export async function findDiagnosisByCodeAction(code: string, onDate?: string): Promise<DiagnosisCode | null> {
  return findDiagnosisByCode("CIE10", code, onDate);
}
