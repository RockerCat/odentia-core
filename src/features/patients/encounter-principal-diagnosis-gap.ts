import { resolveDiagnosesForService } from "@/features/rips/export-generator";
import type { EncounterClinicalData, EncounterDiagnosisRecord, EncounterServiceRecord } from "./clinical-encounters-data";

// Historia Clínica's Atenciones tab — "does this already-finalized
// encounter have at least one classified service with no resolvable
// principal diagnosis." Reuses resolveDiagnosesForService
// (export-generator.ts) directly — the EXACT SAME resolution
// export-readiness.ts's own ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING check
// already uses and the generator itself uses to build the real RIPS JSON
// — so "this tab shows a gap" and "the generator can actually resolve a
// principal" can never disagree. Never reimplemented as a second,
// possibly-drifting predicate.
export function hasMissingPrincipalDiagnosis(
  diagnoses: EncounterDiagnosisRecord[],
  services: Pick<EncounterServiceRecord, "id" | "ripsServiceType">[],
): boolean {
  return services.some(
    (s) => s.ripsServiceType !== "unknown" && resolveDiagnosesForService(diagnoses, s.id).principal === null,
  );
}

// Same visibility rule as shouldShowRipsFieldGapIndicator
// (encounter-service-rips-field-gap.ts) — Option B, never C: never shown
// to a role with no clinical write authority, not even disabled.
export function shouldShowMissingPrincipalDiagnosisIndicator(
  canEditClinicalData: boolean,
  diagnoses: EncounterDiagnosisRecord[],
  services: Pick<EncounterServiceRecord, "id" | "ripsServiceType">[],
): boolean {
  return canEditClinicalData && hasMissingPrincipalDiagnosis(diagnoses, services);
}

// AtencionesTab's own local-update reducer for this correction — same
// "unit-testable without rendering" reason as applyRipsFieldCorrection
// (encounter-service-rips-field-gap.ts). Appends the ONE new
// encounter-wide principal diagnosis CompleteEncounterPrincipalDiagnosisModal
// just persisted (add_missing_finalized_encounter_principal_diagnosis's
// own missing-only guarantee means there is never a pre-existing
// principal to replace here) — every other diagnosis already on the
// encounter (related, or a service-scoped one, however unlikely under
// the current MVP model) is left completely untouched. An encounter this
// map has no entry for is returned unchanged (defensive, should not
// normally happen since the modal only ever opens for an encounter
// already present here).
export function applyPrincipalDiagnosisCorrection(
  data: Map<string, EncounterClinicalData>,
  encounterId: string,
  added: { id: string; sequence: number; cie10Code: string; diagnosisTypeCode: string | null },
): Map<string, EncounterClinicalData> {
  const encounterData = data.get(encounterId);
  if (!encounterData) return data;

  const newDiagnosis: EncounterDiagnosisRecord = {
    id: added.id,
    encounterId,
    cie10Code: added.cie10Code,
    role: "principal",
    diagnosisTypeCode: added.diagnosisTypeCode,
    encounterServiceId: null,
    sequence: added.sequence,
  };

  const next = new Map(data);
  next.set(encounterId, { ...encounterData, diagnoses: [...encounterData.diagnoses, newDiagnosis] });
  return next;
}
