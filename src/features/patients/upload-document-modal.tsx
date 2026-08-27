"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { ALLOWED_DOCUMENT_MIME_TYPES, uploadPatientClinicalDocument } from "./clinical-documents-actions";
import { CLINICAL_DOCUMENT_KIND_LABELS, type ClinicalDocumentKind, type ClinicalDocumentRecord } from "./clinical-documents-data";

const KIND_OPTIONS: { value: ClinicalDocumentKind; label: string }[] = (
  Object.keys(CLINICAL_DOCUMENT_KIND_LABELS) as ClinicalDocumentKind[]
).map((value) => ({ value, label: CLINICAL_DOCUMENT_KIND_LABELS[value] }));

// Same modal shell/field conventions as EditAntecedentesModal — the demo
// itself has no upload UI to restore (its DocumentosTab is mock metadata
// only, see documentos-tab.tsx's own comment), so this borrows the
// already-approved form-modal pattern instead of inventing a new one.
export function UploadDocumentModal({
  clinicId,
  patientId,
  onClose,
  onUploaded,
}: {
  clinicId: string;
  patientId: string;
  onClose: () => void;
  onUploaded: (document: ClinicalDocumentRecord) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<ClinicalDocumentKind>("otro");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !file) return;
    setSaving(true);
    setError(null);

    const outcome = await uploadPatientClinicalDocument({
      clinicId,
      patientId,
      file,
      kind,
      title: title.trim() || null,
    });

    setSaving(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    onUploaded(outcome.document);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Subir documento"
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Subir documento</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Archivo</span>
              <input
                type="file"
                accept={ALLOWED_DOCUMENT_MIME_TYPES.join(",")}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className={FIELD_CLASS}
              />
              <span className="text-[11px] text-muted-foreground">
                JPG, PNG, WEBP, PDF o DOC/DOCX. Máximo 20MB.
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Categoría</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ClinicalDocumentKind)}
                className={FIELD_CLASS}
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Título (opcional)</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Radiografía panorámica"
                className={FIELD_CLASS}
              />
            </label>

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !file}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Subiendo…" : "Subir documento"}
          </button>
        </div>
      </form>
    </div>
  );
}
