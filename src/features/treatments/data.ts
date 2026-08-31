import type { SupabaseClient } from "@supabase/supabase-js";

// Real "Tratamientos" catalog — public.treatments (see the treatments
// migration). Replaces dashboard/mock-data.ts's hardcoded TREATMENT_OPTIONS
// as the source for "Nueva cita"'s Tratamiento picker and Configuración's
// own Tratamientos management section. Same convention as
// src/features/patients/data.ts: takes an already-constructed
// SupabaseClient so the same query runs unchanged from a Server Component's
// initial load or a Client Component refetch/mutation.

export type Treatment = {
  id: string;
  clinicId: string;
  name: string;
  active: boolean;
  createdAt: string;
};

function mapRow(row: { id: string; clinic_id: string; name: string; active: boolean; created_at: string }): Treatment {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
  };
}

const TREATMENT_COLUMNS = "id, clinic_id, name, active, created_at";

// Every treatment (active and inactive) — Configuración's own management
// list needs both so an admin can find and reactivate an inactive one.
export async function fetchTreatments(supabase: SupabaseClient, clinicId: string): Promise<Treatment[]> {
  const { data, error } = await supabase
    .from("treatments")
    .select(TREATMENT_COLUMNS)
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

// Active-only names, for "Nueva cita"/appointment detail's Tratamiento
// <select> — those only ever need a flat string list (see schedule-config.ts's
// own TIME_SLOTS convention), never the full row.
export async function fetchActiveTreatmentNames(supabase: SupabaseClient, clinicId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("treatments")
    .select("name")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.name as string);
}
