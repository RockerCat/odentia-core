import type { SupabaseClient } from "@supabase/supabase-js";

// Real Atenciones data — public.patient_clinical_encounters (see the
// migration): one row per clinical encounter actually attended. Same
// convention as medical-history-data.ts/tooth-findings-data.ts
// (already-constructed SupabaseClient, runs unchanged server- or
// client-side).

export type ClinicalEncounterRecord = {
  id: string;
  patientId: string;
  appointmentId: string | null;
  occurredAt: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  attendedBy: string | null;
  createdAt: string;
};

export function mapClinicalEncounterRow(row: {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  occurred_at: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  attended_by: string | null;
  created_at: string;
}): ClinicalEncounterRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    occurredAt: row.occurred_at,
    reason: row.reason,
    diagnosis: row.diagnosis,
    treatment: row.treatment,
    notes: row.notes,
    attendedBy: row.attended_by,
    createdAt: row.created_at,
  };
}

// clinic_id filter is redundant with RLS (patient_clinical_encounters_select_member
// already scopes to the caller's own clinic membership) — kept as an
// explicit second check anyway, same convention as
// fetchPatientMedicalHistory/fetchPatientToothFindings. Chronological order
// (occurred_at desc — most recent encounter first), matching the demo's
// timeline (see clinical-record-screen.tsx's AtencionesTab).
const CLINICAL_ENCOUNTER_COLUMNS =
  "id, patient_id, appointment_id, occurred_at, reason, diagnosis, treatment, notes, attended_by, created_at";

export async function fetchPatientClinicalEncounters(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<ClinicalEncounterRecord[]> {
  const { data, error } = await supabase
    .from("patient_clinical_encounters")
    .select(CLINICAL_ENCOUNTER_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapClinicalEncounterRow);
}

// Used by /agenda/atencion/[appointmentId] to check, on every load, whether
// this Cita's encounter was already recorded — see the appointment_id
// migration's own comment (patient_clinical_encounters_appointment_id_key):
// at most one row per appointment_id. Lets a refresh (or a retried
// "Finalizar atención") tell "already finalized, just resume/close" apart
// from "genuinely still in progress" without relying on client-only state.
export async function fetchClinicalEncounterByAppointmentId(
  supabase: SupabaseClient,
  clinicId: string,
  appointmentId: string,
): Promise<ClinicalEncounterRecord | null> {
  const { data, error } = await supabase
    .from("patient_clinical_encounters")
    .select(CLINICAL_ENCOUNTER_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapClinicalEncounterRow(data) : null;
}
