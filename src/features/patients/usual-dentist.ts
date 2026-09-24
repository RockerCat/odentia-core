import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClinicalEncounterRecord } from "./clinical-encounters-data";
import { resolveUpdatedByProfessional } from "./resolve-updated-by";

// "Odontólogo habitual" — there is NO persisted patient↔dentist assignment
// in the schema (patients belong to the Clinic, never to a Dentist — see
// CLAUDE.md Domain Model). What Odentia shows under that label is derived,
// never stored: the professional who attended the patient's most recent
// FINALIZED atención (patient_clinical_encounters.attended_by, captured
// server-side as auth.uid() at save time). ONE rule for every surface that
// shows the label — the Paciente modal, Historia Clínica and its PDF —
// so they can never disagree again (Pilot E2E: the modal showed the real
// professional while Historia Clínica hardcoded "Aún sin odontólogo").
//
// `encounters` must be fetchPatientClinicalEncounters' own result
// (finalized only, occurred_at desc), so [0] is the latest — the same
// "última atención" lastVisitLabelFrom (resumen-tab.tsx) already uses.
export function usualDentistProfileIdFrom(encounters: Pick<ClinicalEncounterRecord, "attendedBy">[]): string | null {
  return encounters[0]?.attendedBy ?? null;
}

// Display name for that professional, or null when there's no finalized
// atención yet or its author is no longer resolvable as a current team
// member — callers show their own empty-state copy, never an invented name.
export async function resolveUsualDentistName(
  supabase: SupabaseClient,
  clinicId: string,
  encounters: Pick<ClinicalEncounterRecord, "attendedBy">[],
): Promise<string | null> {
  const profileId = usualDentistProfileIdFrom(encounters);
  if (!profileId) return null;
  const professional = await resolveUpdatedByProfessional(supabase, clinicId, profileId);
  return professional?.name ?? null;
}
