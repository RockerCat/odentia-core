import { createClient } from "@/lib/supabase/client";
import { mapClinicalNoteRow, type ClinicalNoteRecord } from "./clinical-notes-data";

// The one sanctioned write path for each operation — always through
// insert_patient_clinical_note()/update_patient_clinical_note()/
// archive_patient_clinical_note() (see the patient_clinical_notes
// migration), never a direct table INSERT/UPDATE (there is no RLS policy
// for either, deliberately). Each RPC resolves the patient's/note's real
// clinic_id and auth.uid() itself server-side and re-checks authorization
// (is_active_clinical_professional) — this client wrapper never sends
// clinic_id/created_by/updated_by, and never assumes the UI's own
// canEditClinicalData() check is sufficient on its own.

export type ClinicalNoteOutcome = { status: "ok"; note: ClinicalNoteRecord } | { status: "error"; message: string };

export async function createPatientClinicalNote(patientId: string, content: string): Promise<ClinicalNoteOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("insert_patient_clinical_note", {
    p_patient_id: patientId,
    p_content: content,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para crear notas clínicas de este paciente." };
    }
    return { status: "error", message: "No pudimos guardar la nota. Intenta de nuevo." };
  }

  return { status: "ok", note: mapClinicalNoteRow(data) };
}

export async function updatePatientClinicalNote(noteId: string, content: string): Promise<ClinicalNoteOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_patient_clinical_note", {
    p_note_id: noteId,
    p_content: content,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para editar esta nota." };
    }
    return { status: "error", message: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  return { status: "ok", note: mapClinicalNoteRow(data) };
}

// Logical archive only — the row stays for traceability (see the
// migration's own comment: "NO eliminar físicamente"). Same authorization
// boundary as create/update above.
export async function archivePatientClinicalNote(noteId: string): Promise<ClinicalNoteOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("archive_patient_clinical_note", { p_note_id: noteId });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para archivar esta nota." };
    }
    return { status: "error", message: "No pudimos archivar la nota. Intenta de nuevo." };
  }

  return { status: "ok", note: mapClinicalNoteRow(data) };
}
