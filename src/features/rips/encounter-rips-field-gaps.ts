// RIPS — groups SERVICE_FINALIDAD_MISSING/CONSULTATION_CAUSA_MOTIVO_MISSING
// readiness errors by encounterId, never by patientId, never one group per
// error — same reasoning as encounter-service-rips-gaps.ts's own A4B
// grouping: every service in one encounter shares the same context worth
// reviewing together (patient, atención date), even though the actual
// mutation this feeds (correct_encounter_service_rips_field) is always
// one explicit service+field+value at a time, never a batch. Pure — same
// "testable without the screen" convention as every other *-gaps.ts file
// here.
import type { RipsReadinessError } from "./export-readiness";

export type EncounterRipsFieldGapService = {
  serviceId: string;
  missingFinalidad: boolean;
  // Only ever true for a consultation-classified service — a procedure
  // never produces CONSULTATION_CAUSA_MOTIVO_MISSING in the first place
  // (see export-readiness.ts), so this flag is never true for one.
  missingCausaMotivo: boolean;
};

export type EncounterRipsFieldGap = {
  encounterId: string;
  services: EncounterRipsFieldGapService[];
};

export function groupEncounterRipsFieldGaps(errors: RipsReadinessError[]): EncounterRipsFieldGap[] {
  const groups: EncounterRipsFieldGap[] = [];
  const groupByEncounterId = new Map<string, EncounterRipsFieldGap>();
  const serviceIndexByEncounterId = new Map<string, Map<string, number>>();

  for (const error of errors) {
    if (error.code !== "SERVICE_FINALIDAD_MISSING" && error.code !== "CONSULTATION_CAUSA_MOTIVO_MISSING") continue;
    if (!error.encounterId || !error.serviceId) continue;

    let group = groupByEncounterId.get(error.encounterId);
    let serviceIndex = serviceIndexByEncounterId.get(error.encounterId);
    if (!group || !serviceIndex) {
      group = { encounterId: error.encounterId, services: [] };
      serviceIndex = new Map();
      groupByEncounterId.set(error.encounterId, group);
      serviceIndexByEncounterId.set(error.encounterId, serviceIndex);
      groups.push(group);
    }

    let idx = serviceIndex.get(error.serviceId);
    if (idx === undefined) {
      idx = group.services.length;
      group.services.push({ serviceId: error.serviceId, missingFinalidad: false, missingCausaMotivo: false });
      serviceIndex.set(error.serviceId, idx);
    }

    if (error.code === "SERVICE_FINALIDAD_MISSING") {
      group.services[idx]!.missingFinalidad = true;
    } else {
      group.services[idx]!.missingCausaMotivo = true;
    }
  }

  return groups;
}
