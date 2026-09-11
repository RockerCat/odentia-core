import { getRipsExportReadiness, type RipsReadinessError } from "@/features/rips/export-readiness";

// PROMPT NINJA "Crear bloque dedicado Configuración RIPS en Clínica" —
// /clinica's own "¿está lista mi configuración RIPS?" indicator, reusing
// getRipsExportReadiness() (the SAME function /rips itself calls) instead
// of a second, parallel set of rules that could drift and say "lista"
// while /rips still shows a blocker. patients/encounters are always sent
// empty — /clinica has no patient/encounter data loaded, and this block
// is explicitly scoped to clinic/location structure only (never a
// per-patient or per-atención concern) — the scope filter below is a
// defensive, self-documenting no-op given that, not load-bearing on its
// own.
export type RipsClinicConfigStatus = {
  ready: boolean;
  errors: RipsReadinessError[];
};

export function getRipsClinicConfigStatus(params: {
  clinicTaxId: string | null;
  location: { id: string; name: string; codPrestador: string | null } | null;
}): RipsClinicConfigStatus {
  const result = getRipsExportReadiness({
    clinicTaxId: params.clinicTaxId,
    locations: params.location ? [params.location] : [],
    patients: [],
    encounters: [],
  });
  const structuralErrors = result.errors.filter((error) => error.scope === "clinic" || error.scope === "location");
  return { ready: structuralErrors.length === 0, errors: structuralErrors };
}
