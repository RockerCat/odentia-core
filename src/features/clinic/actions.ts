import { createClient } from "@/lib/supabase/client";

export type ActionOutcome = { status: "ok" } | { status: "error" };

// "Información general" edits (see clinic-settings-screen.tsx) — under
// clinics_update_admin RLS (clinic_admin of that clinic only). Only the
// fields the approved screen actually exposes an editor for (name/phone/
// email) — legal_name/tax_id/status have real columns but no input in this
// screen yet (see task scope, section 1: don't invent UI, just report it).
export type ClinicInfoPatch = Partial<{ name: string; phone: string; email: string }>;

export async function updateClinicInfo(clinicId: string, patch: ClinicInfoPatch): Promise<ActionOutcome> {
  const supabase = createClient();
  const { error } = await supabase.from("clinics").update(patch).eq("id", clinicId);
  return error ? { status: "error" } : { status: "ok" };
}

// "Sede principal" edits — under clinic_locations_update_admin RLS
// (already covers every column on this table; a table-level GRANT/policy
// isn't scoped per-column, so extending this patch to state/latitude/
// longitude needed no new grant or policy). latitude/longitude are always
// sent together (both a number or both null) — the caller
// (primary-location-section.tsx) is what enforces that invariant before
// calling this, matching the DB's own "both or neither" check constraint.
export type PrimaryLocationPatch = Partial<{
  address: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
}>;

export async function updatePrimaryLocation(locationId: string, patch: PrimaryLocationPatch): Promise<ActionOutcome> {
  const supabase = createClient();
  const { error } = await supabase.from("clinic_locations").update(patch).eq("id", locationId);
  return error ? { status: "error" } : { status: "ok" };
}
