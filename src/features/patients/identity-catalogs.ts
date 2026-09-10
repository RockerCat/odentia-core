import { getActiveReferenceValues } from "@/features/rips/catalog-data";
import type { PatientIdentityCatalogs } from "./data";

// Server-only on purpose (see data.ts's own comment on why this fetch
// function does NOT live there): getActiveReferenceValues ultimately uses
// @/lib/supabase/server (next/headers), which must never be reachable
// from a Client Component's bundle. Only import this from a Server
// Component page (/pacientes, /agenda), never from a "use client" file.
const PATIENT_IDENTITY_CATALOG_KEYS = [
  "TipoDocumento",
  "SEXOconIndeterminado",
  "RIPSTipoUsuarioVersion2",
  "Pais",
  "ZonaVersion2",
] as const;

export async function fetchPatientIdentityCatalogs(): Promise<PatientIdentityCatalogs> {
  const entries = await Promise.all(
    PATIENT_IDENTITY_CATALOG_KEYS.map(async (key) => [key, await getActiveReferenceValues(key)] as const),
  );
  return Object.fromEntries(entries) as PatientIdentityCatalogs;
}
