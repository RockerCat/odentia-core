import type { SupabaseClient } from "@supabase/supabase-js";

// Real "Consultorios" catalog — public.rooms (see the rooms migration).
// Replaces dashboard/mock-data.ts's hardcoded ROOMS as the source for
// "Nueva cita"'s Consultorio picker and /clinica's own Consultorios
// section. Same convention as src/features/treatments/data.ts: takes an
// already-constructed SupabaseClient so the same query runs unchanged from
// a Server Component's initial load or a Client Component refetch/mutation.

export type Room = {
  id: string;
  clinicId: string;
  name: string;
  active: boolean;
  createdAt: string;
};

function mapRow(row: { id: string; clinic_id: string; name: string; active: boolean; created_at: string }): Room {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
  };
}

const ROOM_COLUMNS = "id, clinic_id, name, active, created_at";

// Every room (active and inactive) — /clinica's own Consultorios list needs
// both so an admin can find and reactivate an inactive one.
export async function fetchRooms(supabase: SupabaseClient, clinicId: string): Promise<Room[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

// Active-only names, for "Nueva cita"/appointment detail's Consultorio
// picker — those only ever need a flat string list (see
// treatments/data.ts's own fetchActiveTreatmentNames), never the full row.
export async function fetchActiveRoomNames(supabase: SupabaseClient, clinicId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select("name")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.name as string);
}
