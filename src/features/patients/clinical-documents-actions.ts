import { createClient } from "@/lib/supabase/client";
import { mapClinicalDocumentRow, type ClinicalDocumentKind, type ClinicalDocumentRecord } from "./clinical-documents-data";

// Real server-side limits — must match the "clinical-documents" Storage
// bucket's own file_size_limit/allowed_mime_types (see the storage
// migration) exactly. Reused here for client-side validation (UX only,
// the bucket config is the real backstop — see task scope: "validar tanto
// en cliente como Storage") and for the upload form's file input `accept`.
export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export type UploadDocumentInput = {
  clinicId: string;
  patientId: string;
  file: File;
  kind: ClinicalDocumentKind;
  title: string | null;
};

export type UploadDocumentOutcome = { status: "ok"; document: ClinicalDocumentRecord } | { status: "error"; message: string };

// Two-step write, same "Storage first, then metadata RPC" order the
// storage migration's own comment describes: (1) upload the real bytes to
// the private bucket, gated by clinical_documents_insert_clinical_professional
// (storage RLS — the real enforcement boundary for who may write which
// clinic's folder); (2) register the metadata row via
// insert_patient_clinical_document(), which re-derives clinic_id/auth.uid()
// server-side and re-validates the path belongs to this exact
// clinic/patient — never trusts this client wrapper's own inputs alone.
export async function uploadPatientClinicalDocument(input: UploadDocumentInput): Promise<UploadDocumentOutcome> {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(input.file.type as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number])) {
    return { status: "error", message: "Formato de archivo no permitido." };
  }
  if (input.file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return { status: "error", message: "El archivo supera el tamaño máximo permitido (20MB)." };
  }

  const supabase = createClient();
  const storagePath = `${input.clinicId}/${input.patientId}/${crypto.randomUUID()}-${sanitizeFilename(input.file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("clinical-documents")
    .upload(storagePath, input.file, { contentType: input.file.type });
  if (uploadError) {
    return { status: "error", message: "No pudimos subir el archivo. Intenta de nuevo." };
  }

  const { data, error: rpcError } = await supabase.rpc("insert_patient_clinical_document", {
    p_patient_id: input.patientId,
    p_storage_path: storagePath,
    p_filename: input.file.name,
    p_mime_type: input.file.type,
    p_file_size: input.file.size,
    p_kind: input.kind,
    p_title: input.title,
  });

  if (rpcError) {
    if (rpcError.code === "42501") {
      return { status: "error", message: "No tienes permiso para subir documentos de este paciente." };
    }
    return { status: "error", message: "El archivo se subió, pero no pudimos registrar sus datos. Intenta de nuevo." };
  }

  return { status: "ok", document: mapClinicalDocumentRow(data) };
}

// Signed, time-limited URL for preview/download — never a permanent
// public URL (the bucket is private). Minting one still goes through
// clinical_documents_select_member (storage RLS), so a caller outside the
// document's clinic gets a denied request here too, not just a hidden UI
// button.
export async function getSignedDocumentUrl(storagePath: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from("clinical-documents").createSignedUrl(storagePath, 300);
  if (error || !data) return null;
  return data.signedUrl;
}

export type UpdateDocumentMetadataInput = {
  documentId: string;
  title: string | null;
  kind: ClinicalDocumentKind;
};

export type DocumentMetadataOutcome =
  | { status: "ok"; document: ClinicalDocumentRecord }
  | { status: "error"; message: string };

// Metadata-only edit (título/categoría) — never the file itself (see task
// scope). Goes through update_patient_clinical_document(), which
// re-derives clinic_id from the document row and re-checks authorization
// server-side.
export async function updatePatientClinicalDocument(input: UpdateDocumentMetadataInput): Promise<DocumentMetadataOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_patient_clinical_document", {
    p_document_id: input.documentId,
    p_title: input.title,
    p_kind: input.kind,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para editar este documento." };
    }
    return { status: "error", message: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  return { status: "ok", document: mapClinicalDocumentRow(data) };
}

// Logical archive only — the row and the Storage file both stay (see task
// scope: "NO eliminar físicamente"). Goes through
// archive_patient_clinical_document(), same authorization boundary as the
// other clinical writes.
export async function archivePatientClinicalDocument(documentId: string): Promise<DocumentMetadataOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("archive_patient_clinical_document", { p_document_id: documentId });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para archivar este documento." };
    }
    return { status: "error", message: "No pudimos archivar el documento. Intenta de nuevo." };
  }

  return { status: "ok", document: mapClinicalDocumentRow(data) };
}
