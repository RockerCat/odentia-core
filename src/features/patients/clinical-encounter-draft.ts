// Pure helpers for the Atención Clínica draft/finalized model (see the
// 20260903120000 migration and upsertPatientClinicalEncounter). Extracted
// out of RealClinicalEncounterScreen so the rules themselves — not just the
// component wiring around them — are directly unit-testable.

export type ProcedureInput = { name: string; note: string };

// Blank-name rows are dropped — matches upsert_patient_clinical_encounter's
// own filter (`where coalesce(item ->> 'name', '') <> ''`), so the client
// and the RPC never disagree about what counts as "a procedure."
export function buildProceduresPayload(procedures: ProcedureInput[]): { name: string; note: string | null }[] {
  return procedures.filter((p) => p.name.trim()).map((p) => ({ name: p.name, note: p.note || null }));
}

// Auto-derived summary stored in patient_clinical_encounters.treatment —
// the flattened, display-only convenience Historia Clínica/PDF read
// directly, kept in sync with the structured procedures list on every
// save (see the migration's own comment on why treatment stays a plain
// string alongside the relational procedures table).
export function buildTreatmentText(procedures: ProcedureInput[]): string | null {
  const names = procedures.map((p) => p.name).filter(Boolean);
  return names.length > 0 ? names.join(", ") : null;
}

// The draft/finalized state itself — see clinical-encounters-data.ts's own
// comment on finalizedAt. Centralized here so any future caller checks the
// same rule instead of re-deriving `!== null` inline.
export function isEncounterFinalized(encounter: { finalizedAt: string | null } | null): boolean {
  return encounter?.finalizedAt != null;
}
