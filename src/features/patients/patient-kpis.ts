import type { SupabaseClient } from "@supabase/supabase-js";
import { TERMINAL_STATUSES } from "@/features/dashboard/real-status";

// Real /pacientes KPIs — "Con cita próxima" and "Sin atención +6 meses".
// Same convention as data.ts/appointments-data.ts/clinical-encounters-data.ts:
// takes an already-constructed SupabaseClient, clinic_id always comes from
// resolveClinicContext(), never a URL/form. Two independent, minimal-column
// queries merged in JS (same "queries simples y aburridas" convention as
// clinic/data.ts's fetchTeamMembers/appointments-data.ts's own top
// comment) — neither table has a plain FK the other could embed through
// anyway (both only key off patient_id, no clinic-wide aggregate view
// exists), and a failure in one query never has to take the other down.
//
// Both counts are DERIVED on every read, never a stored counter — they
// naturally reflect the current appointments/patient_clinical_encounters
// rows with zero extra bookkeeping to keep in sync (create/cancel/complete
// a Cita, or finalize an Atención, just changes what the next fetch sees).
//
// Row-level security already scopes both source tables per the SAME rules
// the rest of the app already lives under — this file adds no new access:
// clinic_admin/assistant see the whole clinic's appointments
// (can_access_appointment), a dentist only their own (same scoping
// Agenda's own KPI cards already use, see real-agenda-screen.tsx); Atención
// history stays clinic-wide for every role (patient_clinical_encounters_
// select_member), matching Historia Clínica's own "clinical data is
// clinic-wide, never per-dentist" rule (see CLAUDE.md Domain Model).

export const UNATTENDED_MONTHS_THRESHOLD = 6;

// Pure and testable on its own (see patient-kpis.test.ts), same shape as
// real-status.ts's own isUnresolved(appointment, now = new Date()) —
// `now` is injectable so the exact 6-month boundary is deterministic to
// test, never dependent on when the suite happens to run.
export function isUnattendedSixMonths(lastFinalizedOccurredAtIso: string, now: Date = new Date()): boolean {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - UNATTENDED_MONTHS_THRESHOLD);
  return new Date(lastFinalizedOccurredAtIso).getTime() <= cutoff.getTime();
}

export type PatientKpis = {
  // Distinct patients with at least one FUTURE, non-terminal Cita — a
  // patient with several qualifying Citas still counts once (see
  // upcomingResult below: a Set of patient_id, not a row count).
  patientsWithUpcomingAppointment: number;
  // Distinct patients whose most recent FINALIZED Atención
  // (patient_clinical_encounters.finalized_at is not null) happened more
  // than UNATTENDED_MONTHS_THRESHOLD months ago. A patient with zero
  // finalized Atenciones is deliberately EXCLUDED — see this file's own
  // top comment and the task report: "sin atención +6 meses" reads as "was
  // attended, then went quiet," not "never attended at all" (Historia
  // Clínica's own Resumen card already draws this same distinction — a
  // patient with no encounters shows the honest "Sin atenciones
  // registradas", never a fabricated staleness value — see resumen-tab.tsx).
  patientsUnattendedSixMonths: number;
};

export async function fetchPatientKpis(
  supabase: SupabaseClient,
  clinicId: string,
  now: Date = new Date(),
): Promise<PatientKpis> {
  const upcomingResult = await supabase
    .from("appointments")
    .select("patient_id")
    .eq("clinic_id", clinicId)
    .gt("starts_at", now.toISOString())
    .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`);
  if (upcomingResult.error) throw upcomingResult.error;
  const patientsWithUpcomingAppointment = new Set(upcomingResult.data?.map((row) => row.patient_id) ?? []).size;

  const encountersResult = await supabase
    .from("patient_clinical_encounters")
    .select("patient_id, occurred_at")
    .eq("clinic_id", clinicId)
    .not("finalized_at", "is", null);
  if (encountersResult.error) throw encountersResult.error;

  const lastOccurredAtByPatient = new Map<string, string>();
  for (const row of encountersResult.data ?? []) {
    const current = lastOccurredAtByPatient.get(row.patient_id);
    if (!current || new Date(row.occurred_at).getTime() > new Date(current).getTime()) {
      lastOccurredAtByPatient.set(row.patient_id, row.occurred_at);
    }
  }

  let patientsUnattendedSixMonths = 0;
  for (const lastOccurredAt of lastOccurredAtByPatient.values()) {
    if (isUnattendedSixMonths(lastOccurredAt, now)) patientsUnattendedSixMonths++;
  }

  return { patientsWithUpcomingAppointment, patientsUnattendedSixMonths };
}
