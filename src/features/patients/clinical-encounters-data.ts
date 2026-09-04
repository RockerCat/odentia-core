import type { SupabaseClient } from "@supabase/supabase-js";

// Real Atenciones data — public.patient_clinical_encounters (see the
// migration): one row per clinical encounter. Same convention as
// medical-history-data.ts/tooth-findings-data.ts (already-constructed
// SupabaseClient, runs unchanged server- or client-side).
//
// finalizedAt (nullable) is the draft/finalized state itself (see the
// 20260903120000 migration's own comment) — null means "Guardar borrador"
// created/updated this row but "Finalizar atención" hasn't happened yet.
// fetchPatientClinicalEncounters (Historia Clínica's own read) filters to
// finalizedAt IS NOT NULL — a draft is never a real clinical record yet.

export type ClinicalEncounterRecord = {
  id: string;
  patientId: string;
  appointmentId: string | null;
  occurredAt: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  indications: string | null;
  attendedBy: string | null;
  finalizedAt: string | null;
  createdAt: string;
};

type ClinicalEncounterRow = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  occurred_at: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  indications: string | null;
  attended_by: string | null;
  finalized_at: string | null;
  created_at: string;
};

export function mapClinicalEncounterRow(row: ClinicalEncounterRow): ClinicalEncounterRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    occurredAt: row.occurred_at,
    reason: row.reason,
    diagnosis: row.diagnosis,
    treatment: row.treatment,
    notes: row.notes,
    indications: row.indications,
    attendedBy: row.attended_by,
    finalizedAt: row.finalized_at,
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
  "id, patient_id, appointment_id, occurred_at, reason, diagnosis, treatment, notes, indications, attended_by, finalized_at, created_at";

// Historia Clínica / PDF export — only ever shows FINALIZED encounters. A
// draft ("Guardar borrador" without "Finalizar atención" yet) is not a real
// clinical record, and must never appear here even though the row already
// exists in Postgres.
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
    .not("finalized_at", "is", null)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapClinicalEncounterRow);
}

// Used by /agenda/atencion/[appointmentId] on every load to check whether
// this Cita already has a draft or finalized encounter — see the
// appointment_id migration's own comment
// (patient_clinical_encounters_appointment_id_key): at most one row per
// appointment_id. Lets a refresh (or "Continuar atención") reconstruct
// exactly the persisted draft, and lets a retried "Finalizar atención"
// tell "already finalized, just complete the Cita" apart from "still a
// draft" without relying on client-only state. Deliberately NOT filtered
// by finalized_at — this is the resume check, drafts included.
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

export type ClinicalEncounterProcedureRecord = {
  id: string;
  encounterId: string;
  name: string;
  note: string | null;
  position: number;
};

function mapClinicalEncounterProcedureRow(row: {
  id: string;
  encounter_id: string;
  name: string;
  note: string | null;
  position: number;
}): ClinicalEncounterProcedureRecord {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    name: row.name,
    note: row.note,
    position: row.position,
  };
}

// One sequential query, not a nested PostgREST select through the
// composite (encounter_id, clinic_id) FK — same convention/reasoning as
// appointments-data.ts's own top comment (no plain single-column FK
// PostgREST could embed through cleanly here either).
export async function fetchClinicalEncounterProcedures(
  supabase: SupabaseClient,
  clinicId: string,
  encounterId: string,
): Promise<ClinicalEncounterProcedureRecord[]> {
  const { data, error } = await supabase
    .from("patient_clinical_encounter_procedures")
    .select("id, encounter_id, name, note, position")
    .eq("clinic_id", clinicId)
    .eq("encounter_id", encounterId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapClinicalEncounterProcedureRow);
}
