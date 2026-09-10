import { createClient } from "@/lib/supabase/client";

export type ActionOutcome = { status: "ok" } | { status: "error" };

// "Información general" edits (see clinic-settings-screen.tsx) — under
// clinics_update_admin RLS (clinic_admin of that clinic only). name/phone/
// email/tax_id have real editors in this screen; legal_name/status still
// don't (see task scope, section 1: don't invent UI beyond what's asked).
//
// tax_id (RIPS #3 — Documento Técnico 1 campo T01 numDocumentoIdObligado,
// "Número del NIT... tamaño 4-12") is normalized here (strip everything
// but digits) rather than enforced with a DB CHECK: three of the four
// clinics already in production store a plain-digit NIT today, but a real
// Colombian NIT sometimes includes a "-DV" check-digit suffix a user might
// type — stripping it here rather than rejecting the input keeps this the
// one and only place that decides the stored shape, without a migration
// that could reject a legitimate future value the exact format of which
// wasn't in scope to fully nail down this session.
export type ClinicInfoPatch = Partial<{ name: string; phone: string; email: string; tax_id: string }>;

export async function updateClinicInfo(clinicId: string, patch: ClinicInfoPatch): Promise<ActionOutcome> {
  const supabase = createClient();
  const normalized =
    patch.tax_id !== undefined ? { ...patch, tax_id: patch.tax_id.replace(/[^0-9]/g, "") || null } : patch;
  const { error } = await supabase.from("clinics").update(normalized).eq("id", clinicId);
  return error ? { status: "error" } : { status: "ok" };
}

// "Sede principal" edits — under clinic_locations_update_admin RLS
// (already covers every column on this table; a table-level GRANT/policy
// isn't scoped per-column, so extending this patch to state/latitude/
// longitude needed no new grant or policy). latitude/longitude are always
// sent together (both a number or both null) — the caller
// (primary-location-section.tsx) is what enforces that invariant before
// calling this, matching the DB's own "both or neither" check constraint.
// cod_prestador (RIPS #3 — Documento Técnico 1 campos C01/P01 codPrestador,
// "Código otorgado por el Ministerio de Salud... al prestador de servicios
// de salud", tamaño 12) — a REPS habilitación code, one per sede, verified
// against the actual field spec (see the migration adding this column for
// the full citation). The DB CHECK (12 digits) is the real enforcement;
// this action sends the value through unnormalized on purpose — unlike
// tax_id, there's no known "extra character users habitually type" for
// this one to strip.
export type PrimaryLocationPatch = Partial<{
  address: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  cod_prestador: string | null;
}>;

export async function updatePrimaryLocation(locationId: string, patch: PrimaryLocationPatch): Promise<ActionOutcome> {
  const supabase = createClient();
  const { error } = await supabase.from("clinic_locations").update(patch).eq("id", locationId);
  return error ? { status: "error" } : { status: "ok" };
}
