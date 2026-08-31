import { createClient } from "@/lib/supabase/client";
import type { Room } from "./data";

// Real writes on public.rooms — under rooms_insert_admin / rooms_update_admin
// RLS (clinic_admin only, see the rooms migration). No DELETE here — there's
// no DELETE policy either (same active=false convention as
// patients/professional_profiles/treatments): a room that already backs an
// appointment's `room` snapshot must stay findable, just excluded from the
// active picker.

export type ActionOutcome = { status: "ok" } | { status: "error"; message: string };
export type CreateRoomOutcome = { status: "ok"; room: Room } | { status: "error"; message: string };

const DUPLICATE_NAME_ERROR = "Ya existe un consultorio con este nombre en tu clínica.";
const GENERIC_ERROR = "No pudimos guardar el cambio. Intenta de nuevo.";

function mapRow(row: { id: string; clinic_id: string; name: string; active: boolean; created_at: string }): Room {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
  };
}

export async function createRoom(clinicId: string, name: string): Promise<CreateRoomOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("rooms")
    .insert({ clinic_id: clinicId, name })
    .select("id, clinic_id, name, active, created_at")
    .single();

  if (error) {
    // rooms_clinic_id_name_key — one name per clinic, not global.
    if (error.code === "23505") return { status: "error", message: DUPLICATE_NAME_ERROR };
    return { status: "error", message: GENERIC_ERROR };
  }

  return { status: "ok", room: mapRow(data) };
}

export async function renameRoom(roomId: string, name: string): Promise<ActionOutcome> {
  const supabase = createClient();
  const { error } = await supabase.from("rooms").update({ name }).eq("id", roomId);
  if (error) {
    if (error.code === "23505") return { status: "error", message: DUPLICATE_NAME_ERROR };
    return { status: "error", message: GENERIC_ERROR };
  }
  return { status: "ok" };
}

export async function setRoomActive(roomId: string, active: boolean): Promise<ActionOutcome> {
  const supabase = createClient();
  const { error } = await supabase.from("rooms").update({ active }).eq("id", roomId);
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok" };
}
