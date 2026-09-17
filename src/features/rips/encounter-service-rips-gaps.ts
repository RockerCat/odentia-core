// RIPS Fase A4B — groups every RIPS_SERVICE_CONFIGURATION_MISSING
// readiness error by encounterId (never by patientId, never one group per
// error). Pure — same "testable without the screen" convention as
// patient-rips-gaps.ts/export-readiness.ts.
//
// encounterId, not patientId: unlike the patient-scope correction (where
// different fields can genuinely need independent values), every
// encounter_services row within ONE encounter shares the exact same
// professional_profile_id (no co-atención support — see CLAUDE.md's own
// "Profesional del servicio realizado"), so they always resolve to the
// SAME clinic_specialty_rips_services configuration. Grouping by
// encounterId is therefore not just convenient but the only grouping key
// that's structurally guaranteed to be safe.
import type { RipsReadinessError } from "./export-readiness";

export type EncounterServiceRipsGap = {
  encounterId: string;
  serviceIds: string[];
};

// One group per DISTINCT encounterId among RIPS_SERVICE_CONFIGURATION_MISSING
// errors specifically — never any other code, even one that shares the
// "service" scope (SERVICE_VALUE_MISSING, SERVICE_CUPS_UNCLASSIFIED,
// CLINICAL_SERVICE_MAPPING_UNRESOLVED all use a different correction path
// entirely). serviceIds are deduplicated and kept in first-seen order.
export function groupEncounterServiceRipsGaps(errors: RipsReadinessError[]): EncounterServiceRipsGap[] {
  const groups: EncounterServiceRipsGap[] = [];
  const groupByEncounterId = new Map<string, EncounterServiceRipsGap>();

  for (const error of errors) {
    if (error.code !== "RIPS_SERVICE_CONFIGURATION_MISSING" || !error.encounterId || !error.serviceId) continue;

    let group = groupByEncounterId.get(error.encounterId);
    if (!group) {
      group = { encounterId: error.encounterId, serviceIds: [] };
      groupByEncounterId.set(error.encounterId, group);
      groups.push(group);
    }
    if (!group.serviceIds.includes(error.serviceId)) group.serviceIds.push(error.serviceId);
  }

  return groups;
}
