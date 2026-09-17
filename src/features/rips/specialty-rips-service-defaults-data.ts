import { logStepFailed } from "@/features/clinic/debug";
import { createClient } from "@/lib/supabase/server";

// RIPS #A4 — read-only access to specialty_rips_service_defaults
// (20260912130000): Odentia's own GLOBAL suggestions, never a clinic's
// effective configuration (that's clinic_specialty_rips_services, read
// via fetchClinicSpecialtyRipsServices in clinical-concept-data.ts — kept
// in a SEPARATE type/function here on purpose, so "suggested" and
// "confirmed" can never be structurally confused by a caller). No UI
// consumed this table at all before A4 — this is that first, minimal read
// path, mirroring fetchClinicSpecialtyRipsServices's own join shape
// (rips_reference_values for the Servicio's code + its Grupo via
// parent_code) exactly.
export type SpecialtyRipsServiceDefault = {
  specialtyId: string;
  codServicioCode: string;
  grupoServiciosCode: string;
};

type SpecialtyRipsServiceDefaultRow = {
  specialty_id: string;
  rips_reference_values: { code: string; parent_code: string | null } | null;
};

// Global — never clinic-scoped (see the table's own migration: this is
// Odentia's suggestion, administered by Odentia, never per-clinic data).
// Only currently-active suggestions with a resolvable Grupo are returned —
// a default with no parent_code (which the seed never produces, but this
// stays defensive rather than assumed) is silently skipped rather than
// surfaced as a half-formed suggestion.
export async function fetchSpecialtyRipsServiceDefaults(): Promise<SpecialtyRipsServiceDefault[]> {
  const supabase = await createClient();
  // No hint needed on the embed — there is exactly one FK between these
  // two tables (rips_reference_value_id/rips_reference_value_catalog_key,
  // composite, -> rips_reference_values(id, catalog_key)), so PostgREST
  // resolves it unambiguously on its own. A `rips_reference_values:
  // rips_reference_value_id(...)` hint here is NOT "table:column-hint" —
  // PostgREST reads `alias:name(...)` as "embed the relation named
  // `name`", so that form asks for a nonexistent relation literally
  // called `rips_reference_value_id` and fails with PGRST200 ("Could not
  // find a relationship... perhaps you meant 'rips_reference_values'") —
  // confirmed live against the real remote project. A `!column` hint
  // fails too, since the real FK's local side is two columns, not one.
  const { data, error } = await supabase
    .from("specialty_rips_service_defaults")
    .select("specialty_id, rips_reference_values(code, parent_code)")
    .eq("status", "active");
  if (error) {
    logStepFailed("fetchSpecialtyRipsServiceDefaults", error);
    throw error;
  }
  if (!data) return [];
  return (data as unknown as SpecialtyRipsServiceDefaultRow[])
    .filter((row) => row.rips_reference_values !== null && row.rips_reference_values.parent_code !== null)
    .map((row) => ({
      specialtyId: row.specialty_id,
      codServicioCode: row.rips_reference_values!.code,
      grupoServiciosCode: row.rips_reference_values!.parent_code!,
    }));
}
