"use server";

import { findReferenceValueByCode, searchReferenceValues, type ReferenceValue } from "./catalog-data";

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
