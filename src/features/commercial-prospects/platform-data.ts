import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialProspectStatus } from "./state-machine";

export type CommercialProspectListItem = {
  id: string;
  firstName: string;
  lastName: string;
  clinicName: string;
  email: string;
  phone: string;
  city: string;
  status: CommercialProspectStatus;
  createdAt: string;
};

export type CommercialProspectDetail = CommercialProspectListItem & {
  updatedAt: string;
  // Operational axis, separate from `status` (see CLAUDE.md's Prospecto
  // Comercial section: `won` never implies a clinic already exists).
  // Both null until convert_commercial_prospect_to_clinic() succeeds
  // (20260916210000_convert_commercial_prospect_to_clinic.sql), then both
  // set together, never independently.
  convertedClinicId: string | null;
  convertedAt: string | null;
};

const PROSPECT_LIST_SELECT = "id, first_name, last_name, clinic_name, email, phone, city, status, created_at";
const PROSPECT_DETAIL_SELECT = `${PROSPECT_LIST_SELECT}, updated_at, converted_clinic_id, converted_at`;

function mapListRow(row: {
  id: string;
  first_name: string;
  last_name: string;
  clinic_name: string;
  email: string;
  phone: string;
  city: string;
  status: CommercialProspectStatus;
  created_at: string;
}): CommercialProspectListItem {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    clinicName: row.clinic_name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    status: row.status,
    createdAt: row.created_at,
  };
}

// Platform → Prospectos listing — every real Prospecto submitted through
// /demo, read directly under commercial_prospects_select_superadmin
// (supabase/migrations/20260916190000_create_commercial_prospects.sql) —
// a Superadmin-only RLS policy; a clinic member or anon caller gets zero
// rows here regardless of what this function selects. No pagination yet
// (CLAUDE.md's own MVP-first philosophy — the expected volume for this
// checkpoint doesn't warrant it); a fixed cap avoids an unbounded query
// growing silently, same defensive spirit as every other unpaginated
// Platform list in this codebase.
const MAX_PROSPECTS = 500;

export async function fetchCommercialProspects(supabase: SupabaseClient): Promise<CommercialProspectListItem[]> {
  const { data, error } = await supabase
    .from("commercial_prospects")
    .select(PROSPECT_LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(MAX_PROSPECTS);
  if (error) throw error;

  return (data ?? []).map(mapListRow);
}

// Same "is this URL segment even UUID-shaped" guard as
// src/features/platform/clinics-data.ts's own looksLikeClinicId() — an
// arbitrary non-UUID [prospectId] segment must never reach
// commercial_prospects.id (a real `uuid` column), which would otherwise
// throw Postgres' "invalid input syntax for type uuid" instead of a
// clean not-found.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeCommercialProspectId(value: string): boolean {
  return UUID_RE.test(value);
}

export async function fetchCommercialProspectById(
  supabase: SupabaseClient,
  prospectId: string,
): Promise<CommercialProspectDetail | null> {
  const { data, error } = await supabase
    .from("commercial_prospects")
    .select(PROSPECT_DETAIL_SELECT)
    .eq("id", prospectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    ...mapListRow(data),
    updatedAt: data.updated_at,
    convertedClinicId: data.converted_clinic_id,
    convertedAt: data.converted_at,
  };
}
