"use server";

import {
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
export async function searchDiagnosesAction(query: string): Promise<DiagnosisCode[]> {
  if (!query.trim()) return [];
  return searchDiagnoses("CIE10", query, 20);
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
