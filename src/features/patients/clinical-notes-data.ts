import type { SupabaseClient } from "@supabase/supabase-js";

// Real "Notas clínicas importantes" data — public.patient_clinical_notes
// (see the migration): persistent, PATIENT-level notes, explicitly
// distinct from patient_clinical_encounters.notes (a single encounter's
// own free-text) and patient_medical_histories.observations (Antecedentes'
// own general field). Same convention as the other clinical data modules
// (already-constructed SupabaseClient, runs unchanged server- or
// client-side).

export type ClinicalNoteRecord = {
  id: string;
  patientId: string;
  content: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  // archived_at null = active, non-null = archived — see the migration.
  // Never a physical delete: the row always stays, for traceability.
  archivedAt: string | null;
  archivedBy: string | null;
};

export function mapClinicalNoteRow(row: {
  id: string;
  patient_id: string;
  content: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
}): ClinicalNoteRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    content: row.content,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
  };
}

// clinic_id filter is redundant with RLS (patient_clinical_notes_select_member
// already scopes to the caller's own clinic membership) — kept as an
// explicit second check anyway, same convention as the other clinical
// fetchers (defense-in-depth, not the only boundary). Most recently
// updated first (an edit re-surfaces a note as "recent", same convention
// as patient_medical_histories' own updated_at-driven display). Returns
// BOTH active and archived rows — the Resumen card and the PDF builder
// each apply their own "active only" filter client-side against this one
// fetch, not a second round trip.
export async function fetchPatientClinicalNotes(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<ClinicalNoteRecord[]> {
  const { data, error } = await supabase
    .from("patient_clinical_notes")
    .select("id, patient_id, content, created_by, updated_by, created_at, updated_at, archived_at, archived_by")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapClinicalNoteRow);
}
