import type { SupabaseClient } from "@supabase/supabase-js";

// Real Documentos data — public.patient_clinical_documents (see the
// migration): one row per uploaded file's metadata, the actual bytes live
// in the private "clinical-documents" Storage bucket (see the storage
// migration). Same convention as the other clinical data modules
// (already-constructed SupabaseClient, runs unchanged server- or
// client-side).

// Mirrors the demo's ClinicalDocumentKind/CLINICAL_DOCUMENT_KIND_LABELS
// exactly (clinical-record-screen.tsx / mock-data.ts) — that category
// concept already exists in the approved design, so it's kept, not
// reinvented.
export type ClinicalDocumentKind = "radiografia" | "consentimiento" | "fotografia" | "otro";

export const CLINICAL_DOCUMENT_KIND_LABELS: Record<ClinicalDocumentKind, string> = {
  radiografia: "Radiografía",
  consentimiento: "Consentimiento",
  fotografia: "Fotografía clínica",
  otro: "Documento",
};

export type ClinicalDocumentRecord = {
  id: string;
  patientId: string;
  title: string | null;
  kind: ClinicalDocumentKind;
  filename: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  uploadedBy: string | null;
  createdAt: string;
  // archived_at null = active, non-null = archived — see the migration.
  // Never a physical delete: the row and the Storage file both stay.
  archivedAt: string | null;
  archivedBy: string | null;
};

export function mapClinicalDocumentRow(row: {
  id: string;
  patient_id: string;
  title: string | null;
  kind: string;
  filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
  archived_at: string | null;
  archived_by: string | null;
}): ClinicalDocumentRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    title: row.title,
    kind: row.kind as ClinicalDocumentKind,
    filename: row.filename,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
  };
}

// clinic_id filter is redundant with RLS (patient_clinical_documents_select_member
// already scopes to the caller's own clinic membership) — kept as an
// explicit second check anyway, same convention as the other clinical
// fetchers. Most recent upload first. Returns BOTH active and archived
// documents — the Activos/Archivados/Todos filter (see documentos-tab.tsx)
// is applied client-side against this one fetch, not a second round trip
// per filter change.
export async function fetchPatientClinicalDocuments(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<ClinicalDocumentRecord[]> {
  const { data, error } = await supabase
    .from("patient_clinical_documents")
    .select(
      "id, patient_id, title, kind, filename, mime_type, file_size, storage_path, uploaded_by, created_at, archived_at, archived_by",
    )
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapClinicalDocumentRow);
}
