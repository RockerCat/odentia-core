"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, NoteIcon, PencilIcon } from "@/components/shell/icons";
import { createClient } from "@/lib/supabase/client";
import {
  archivePatientClinicalDocument,
  getSignedDocumentUrl,
  isImageMimeType,
} from "./clinical-documents-actions";
import { CLINICAL_DOCUMENT_KIND_LABELS, type ClinicalDocumentRecord } from "./clinical-documents-data";
import { EditDocumentModal } from "./edit-document-modal";
import { resolveUpdatedByProfessional, type UpdatedByProfessional } from "./resolve-updated-by";
import { UploadDocumentModal } from "./upload-document-modal";

// Documentos — 2 columnas en desktop: listado (izquierda, ~40%) + preview
// (derecha, ~60%), sobre el mismo lenguaje visual del resto de Historia
// Clínica (mismas cards/borders/colores que Antecedentes/Odontograma/
// Atenciones) — el demo mismo no define este layout de 2 columnas (su
// DocumentosTab es una lista plana de solo metadata mock, ver el propio
// comentario de esa función), así que esta estructura es nueva, no una
// desviación de algo que el demo ya tenía.
const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
const PREVIEWABLE_INLINE = new Set(["application/pdf"]);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ArchiveFilter = "active" | "archived" | "all";

export function DocumentosTab({
  patientId,
  clinicId,
  documents,
  canUpload,
  onChanged,
}: {
  patientId: string;
  clinicId: string | null;
  documents: ClinicalDocumentRecord[];
  canUpload: boolean;
  onChanged: (documents: ClinicalDocumentRecord[]) => void;
}) {
  const [filter, setFilter] = useState<ArchiveFilter>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editingDocument, setEditingDocument] = useState<ClinicalDocumentRecord | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredDocuments = documents.filter((d) => {
    if (filter === "active") return !d.archivedAt;
    if (filter === "archived") return !!d.archivedAt;
    return true;
  });

  // No effect-based sync: the selection is either the explicit click
  // (selectedId) or, once it's no longer present, falls back to the first
  // item currently in view — always a plain derived value, never a
  // setState-in-effect.
  const selected = documents.find((d) => d.id === selectedId) ?? filteredDocuments[0] ?? null;

  // Resolves each document's uploaded_by/archived_by (profiles.id) to a
  // real name — same fetchTeamMembers-based pattern as Antecedentes/
  // Odontograma/Atenciones, one clinic-team fetch for every distinct
  // professional across the whole list.
  const [resolvedByProfileId, setResolvedByProfileId] = useState<Map<string, UpdatedByProfessional>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clinicId) {
        if (!cancelled) setResolvedByProfileId(new Map());
        return;
      }
      const profileIds = Array.from(
        new Set(documents.flatMap((d) => [d.uploadedBy, d.archivedBy]).filter((id): id is string => Boolean(id))),
      );
      if (profileIds.length === 0) {
        if (!cancelled) setResolvedByProfileId(new Map());
        return;
      }
      try {
        const supabase = createClient();
        const entries = await Promise.all(
          profileIds.map(async (id) => [id, await resolveUpdatedByProfessional(supabase, clinicId, id)] as const),
        );
        if (!cancelled) {
          const next = new Map<string, UpdatedByProfessional>();
          for (const [id, resolved] of entries) if (resolved) next.set(id, resolved);
          setResolvedByProfileId(next);
        }
      } catch {
        if (!cancelled) setResolvedByProfileId(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, documents]);

  // Eager thumbnail preview for images in the list — PDFs/docs keep the
  // icon circle there and only resolve a signed URL when actually
  // selected (see the preview effect below) or on-click "Abrir".
  const [thumbnailUrlByDocumentId, setThumbnailUrlByDocumentId] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const imageDocuments = documents.filter((d) => isImageMimeType(d.mimeType));
      if (imageDocuments.length === 0) {
        if (!cancelled) setThumbnailUrlByDocumentId(new Map());
        return;
      }
      const entries = await Promise.all(
        imageDocuments.map(async (d) => [d.id, await getSignedDocumentUrl(d.storagePath)] as const),
      );
      if (!cancelled) {
        const next = new Map<string, string>();
        for (const [id, url] of entries) if (url) next.set(id, url);
        setThumbnailUrlByDocumentId(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documents]);

  // Full-size preview for the selected document — image (object-contain)
  // or embedded PDF only; DOC/DOCX and anything else falls back to the
  // file-info card in the preview panel (see DocumentPreviewPanel).
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const selectedStoragePath = selected?.storagePath ?? null;
  const selectedMimeType = selected?.mimeType ?? null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedStoragePath || !selectedMimeType || !(isImageMimeType(selectedMimeType) || PREVIEWABLE_INLINE.has(selectedMimeType))) {
        if (!cancelled) setPreviewUrl(null);
        return;
      }
      const url = await getSignedDocumentUrl(selectedStoragePath);
      if (!cancelled) setPreviewUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStoragePath, selectedMimeType]);

  const handleArchive = async (document: ClinicalDocumentRecord) => {
    if (archivingId) return;
    setArchivingId(document.id);
    setActionError(null);

    const outcome = await archivePatientClinicalDocument(document.id);

    setArchivingId(null);
    if (outcome.status === "error") {
      setActionError(outcome.message);
      return;
    }
    onChanged(documents.map((d) => (d.id === outcome.document.id ? outcome.document : d)));
    if (filter === "active") setSelectedId(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-0.5 text-xs">
          {(
            [
              { value: "active", label: "Activos" },
              { value: "archived", label: "Archivados" },
              { value: "all", label: "Todos" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                filter === opt.value ? "bg-primary/10 text-primary" : "text-foreground/60 hover:bg-foreground/5"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {canUpload && (
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
          >
            Subir documento
          </button>
        )}
      </div>

      {actionError && <p className="text-xs text-danger">{actionError}</p>}

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          El paciente todavía no tiene documentos clínicos adjuntos.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
          <div className="max-h-[600px] overflow-y-auto rounded-xl border border-border">
            {filteredDocuments.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No hay documentos en este filtro.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {filteredDocuments.map((doc) => {
                  const isSelected = selected?.id === doc.id;
                  const thumbnailUrl = thumbnailUrlByDocumentId.get(doc.id);
                  return (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(doc.id)}
                        aria-pressed={isSelected}
                        className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                          isSelected ? "bg-primary/10" : "hover:bg-foreground/5"
                        }`}
                      >
                        {thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static/optimizable asset
                          <img src={thumbnailUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <NoteIcon className="size-4" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                            {doc.title || doc.filename}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {CLINICAL_DOCUMENT_KIND_LABELS[doc.kind]} · {DATE_FORMATTER.format(new Date(doc.createdAt))}
                            {doc.archivedAt && " · Archivado"}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DocumentPreviewPanel
            document={selected}
            previewUrl={previewUrl}
            uploadedByName={selected?.uploadedBy ? resolvedByProfileId.get(selected.uploadedBy)?.name : undefined}
            archivedByName={selected?.archivedBy ? resolvedByProfileId.get(selected.archivedBy)?.name : undefined}
            canEdit={canUpload}
            archiving={archivingId === selected?.id}
            onEdit={() => selected && setEditingDocument(selected)}
            onArchive={() => selected && handleArchive(selected)}
          />
        </div>
      )}

      {showUpload && clinicId && (
        <UploadDocumentModal
          clinicId={clinicId}
          patientId={patientId}
          onClose={() => setShowUpload(false)}
          onUploaded={(document) => {
            onChanged([document, ...documents]);
            setSelectedId(document.id);
            setShowUpload(false);
          }}
        />
      )}

      {editingDocument && (
        <EditDocumentModal
          document={editingDocument}
          onClose={() => setEditingDocument(null)}
          onSaved={(document) => {
            onChanged(documents.map((d) => (d.id === document.id ? document : d)));
            setEditingDocument(null);
          }}
        />
      )}
    </div>
  );
}

function DocumentPreviewPanel({
  document,
  previewUrl,
  uploadedByName,
  archivedByName,
  canEdit,
  archiving,
  onEdit,
  onArchive,
}: {
  document: ClinicalDocumentRecord | null;
  previewUrl: string | null;
  uploadedByName: string | undefined;
  archivedByName: string | undefined;
  canEdit: boolean;
  archiving: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  if (!document) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        Selecciona un documento para ver su detalle.
      </div>
    );
  }

  const isImage = isImageMimeType(document.mimeType);
  const isPdf = document.mimeType === "application/pdf";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-lg bg-surface">
        {isImage && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static/optimizable asset
          <img src={previewUrl} alt={document.title || document.filename} className="max-h-[420px] w-full object-contain" />
        ) : isPdf && previewUrl ? (
          <iframe src={previewUrl} title={document.title || document.filename} className="h-[420px] w-full" />
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <NoteIcon className="size-5" />
            </span>
            <p className="text-sm font-medium text-foreground">{document.filename}</p>
            <p className="text-xs text-muted-foreground">
              {document.mimeType} · {formatFileSize(document.fileSize)}
            </p>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">{document.title || document.filename}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {CLINICAL_DOCUMENT_KIND_LABELS[document.kind]} · {DATE_FORMATTER.format(new Date(document.createdAt))} ·{" "}
          {uploadedByName ?? "Sin asignar"}
        </p>
        {document.archivedAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            Archivado el {DATE_FORMATTER.format(new Date(document.archivedAt))}
            {archivedByName && ` · ${archivedByName}`}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={async () => {
            const url = await getSignedDocumentUrl(document.storagePath);
            if (url) window.open(url, "_blank", "noopener,noreferrer");
          }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
        >
          <DownloadIcon className="size-3.5" />
          Abrir/Descargar
        </button>

        {canEdit && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
            >
              <PencilIcon className="size-3.5" />
              Editar información
            </button>
            {!document.archivedAt && (
              <button
                type="button"
                onClick={onArchive}
                disabled={archiving}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-50"
              >
                {archiving ? "Archivando…" : "Archivar"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
