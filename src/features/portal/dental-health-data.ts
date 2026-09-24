import type { ClinicalEncounterRecord, EncounterClinicalData } from "@/features/patients/clinical-encounters-data";
import type { PatientMedicalHistory } from "@/features/patients/medical-history-data";
import { usualDentistProfileIdFrom } from "@/features/patients/usual-dentist";

// "Mi salud dental" — a short, REAL summary of the patient's own record,
// built only from data /portal/historia already reads for her (same
// fetchers, same patient-scoped RLS): Antecedentes (allergies), her
// FINALIZED atenciones, their structured services, and the professionals
// who attended them. Pure, so the whole "what may this screen show" rule
// is unit-tested (dental-health-data.test.ts). It used to be 100% mock
// (a fictitious patient's appointments, allergies and dentist).
//
// A section whose read failed is "error", never an empty list and never
// a fallback — "no data" and "couldn't load" are different facts.

export const RECENT_ENCOUNTERS_LIMIT = 5;
const RECENT_SERVICES_LIMIT = 4;

export type Loaded<T> = { status: "ok"; value: T } | { status: "error" };

export type DentalHealthInput = {
  medicalHistory: Loaded<PatientMedicalHistory | null>;
  // fetchPatientClinicalEncounters' own result: finalized only, occurred_at desc.
  encounters: Loaded<ClinicalEncounterRecord[]>;
  encounterClinicalData: Loaded<Map<string, EncounterClinicalData>>;
  // profiles.id → display name, resolved from the clinic's real team (or
  // the patient-aware author RPC) — never an invented name.
  professionalNames: Map<string, string>;
};

export type DentalHealthEncounter = {
  id: string;
  occurredAt: string;
  professionalName: string | null;
  reason: string | null;
};

export type DentalHealthView = {
  allergies: Loaded<string | null>;
  usualDentistName: Loaded<string | null>;
  recentServices: Loaded<string[]>;
  recentEncounters: Loaded<DentalHealthEncounter[]>;
};

function nonEmpty(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function buildDentalHealthView(input: DentalHealthInput): DentalHealthView {
  const allergies: Loaded<string | null> =
    input.medicalHistory.status === "ok" ? { status: "ok", value: nonEmpty(input.medicalHistory.value?.allergies) } : { status: "error" };

  if (input.encounters.status === "error") {
    return { allergies, usualDentistName: { status: "error" }, recentServices: { status: "error" }, recentEncounters: { status: "error" } };
  }
  const encounters = input.encounters.value;
  const recent = encounters.slice(0, RECENT_ENCOUNTERS_LIMIT);
  const nameOf = (profileId: string | null) => (profileId ? (input.professionalNames.get(profileId) ?? null) : null);

  // Same rule as the staff Paciente modal / Historia Clínica (usual-dentist.ts).
  const usualDentistName: Loaded<string | null> = { status: "ok", value: nameOf(usualDentistProfileIdFrom(encounters)) };

  const recentEncounters: Loaded<DentalHealthEncounter[]> = {
    status: "ok",
    value: recent.map((e) => ({ id: e.id, occurredAt: e.occurredAt, professionalName: nameOf(e.attendedBy), reason: nonEmpty(e.reason) })),
  };

  // Services actually performed (encounter_services — "Plan ≠ servicio
  // realizado"), newest first, by the clinical concept name snapshotted at
  // "Finalizar atención"; a manual-CUPS service with no concept keeps its
  // real code rather than being dropped or renamed.
  let recentServices: Loaded<string[]>;
  if (input.encounterClinicalData.status === "error") {
    recentServices = { status: "error" };
  } else {
    const labels: string[] = [];
    for (const e of recent) {
      for (const s of input.encounterClinicalData.value.get(e.id)?.services ?? []) {
        const label = nonEmpty(s.clinicalConceptNameSnapshot) ?? `CUPS ${s.cupsCode}`;
        if (!labels.includes(label)) labels.push(label);
      }
    }
    recentServices = { status: "ok", value: labels.slice(0, RECENT_SERVICES_LIMIT) };
  }

  return { allergies, usualDentistName, recentServices, recentEncounters };
}
