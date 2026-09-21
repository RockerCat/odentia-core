import type { RipsReadinessError } from "./export-readiness";

// Groups ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING readiness errors by
// encounterId — same "one correction per encounter, never one per
// readiness error" reasoning as encounter-service-rips-gaps.ts (A4B) and
// encounter-rips-field-gaps.ts (Finalidad/Causa): the MVP model has
// exactly ONE encounter-wide principal shared by every service in the
// encounter (CLAUDE.md), so a missing principal fires this SAME
// readiness error once per classified service that needs it — but the
// correction is always the SAME one action for the whole encounter,
// never per-service. Pure — same "testable without the screen"
// convention as every other *-gaps.ts file here.
export type EncounterPrincipalDiagnosisGap = { encounterId: string };

export function groupEncounterPrincipalDiagnosisGaps(errors: RipsReadinessError[]): EncounterPrincipalDiagnosisGap[] {
  const seen = new Set<string>();
  const groups: EncounterPrincipalDiagnosisGap[] = [];
  for (const error of errors) {
    if (error.code !== "ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING" || !error.encounterId) continue;
    if (seen.has(error.encounterId)) continue;
    seen.add(error.encounterId);
    groups.push({ encounterId: error.encounterId });
  }
  return groups;
}
