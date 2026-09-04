"use client";

import { useEffect, useState } from "react";
import { CloseIcon, PencilIcon, PlusIcon } from "@/components/shell/icons";
import { useToast } from "@/components/toast";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { fetchTeamMembers } from "@/features/clinic/data";
import { createClient } from "@/lib/supabase/client";
import { archivePatientClinicalNote, createPatientClinicalNote, updatePatientClinicalNote } from "./clinical-notes-actions";
import type { ClinicalNoteRecord } from "./clinical-notes-data";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// "Gestionar notas" — full CRUD surface for Historia Clínica → Resumen's
// "Notas clínicas importantes" card. canEdit gates create/edit/archive
// (Asistente sees a read-only list — see clinical-permissions.ts's
// canEditClinicalData) the same way AntecedentesTab/OdontogramaTab/
// DocumentosTab already gate their own write UI; the real enforcement
// boundary is still the RPCs themselves (is_active_clinical_professional),
// never this prop alone.
export function ClinicalNotesModal({
  patientId,
  clinicId,
  notes,
  canEdit,
  onClose,
  onChanged,
}: {
  patientId: string;
  clinicId: string | null;
  notes: ClinicalNoteRecord[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: (notes: ClinicalNoteRecord[]) => void;
}) {
  const { showToast } = useToast();
  const activeNotes = notes.filter((n) => !n.archivedAt);

  const [creating, setCreating] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Resolves each note's created_by/updated_by (profiles.id) to a real
  // name — same fetchTeamMembers-based batching already used by
  // Antecedentes/Odontograma/Atenciones/Documentos (see resolve-updated-by.ts's
  // own comment), one clinic-team fetch for every distinct professional
  // across the whole list.
  const [nameByProfileId, setNameByProfileId] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clinicId) {
        if (!cancelled) setNameByProfileId(new Map());
        return;
      }
      const profileIds = Array.from(new Set(notes.flatMap((n) => [n.createdBy, n.updatedBy]).filter((id): id is string => Boolean(id))));
      if (profileIds.length === 0) {
        if (!cancelled) setNameByProfileId(new Map());
        return;
      }
      try {
        const supabase = createClient();
        const members = await fetchTeamMembers(supabase, clinicId);
        const map = new Map<string, string>();
        for (const id of profileIds) {
          const member = members.find((m) => m.profileId === id);
          if (member) map.set(id, `${member.firstName} ${member.lastName}`.trim());
        }
        if (!cancelled) setNameByProfileId(map);
      } catch {
        if (!cancelled) setNameByProfileId(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, notes]);

  const handleCreate = async () => {
    const content = draftContent.trim();
    if (!content || savingNew) return;
    setSavingNew(true);
    setCreateError(null);
    const outcome = await createPatientClinicalNote(patientId, content);
    setSavingNew(false);
    if (outcome.status === "error") {
      setCreateError(outcome.message);
      return;
    }
    onChanged([outcome.note, ...notes]);
    showToast("Nota creada correctamente");
    setDraftContent("");
    setCreating(false);
  };

  const startEdit = (note: ClinicalNoteRecord) => {
    setEditingId(note.id);
    setEditDraft(note.content);
    setEditError(null);
  };

  const handleSaveEdit = async (noteId: string) => {
    const content = editDraft.trim();
    if (!content || savingEditId) return;
    setSavingEditId(noteId);
    setEditError(null);
    const outcome = await updatePatientClinicalNote(noteId, content);
    setSavingEditId(null);
    if (outcome.status === "error") {
      setEditError(outcome.message);
      return;
    }
    onChanged(notes.map((n) => (n.id === outcome.note.id ? outcome.note : n)));
    showToast("Nota actualizada correctamente");
    setEditingId(null);
  };

  const handleArchive = async (noteId: string) => {
    if (archivingId) return;
    setArchivingId(noteId);
    setArchiveError(null);
    const outcome = await archivePatientClinicalNote(noteId);
    setArchivingId(null);
    if (outcome.status === "error") {
      setArchiveError(outcome.message);
      return;
    }
    onChanged(notes.map((n) => (n.id === outcome.note.id ? outcome.note : n)));
    showToast("Nota archivada correctamente");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notas clínicas importantes"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Notas clínicas importantes</p>
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
          {canEdit && (
            <div className="mb-4">
              {creating ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <textarea
                    autoFocus
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    placeholder="Escribe la nota clínica…"
                    rows={3}
                    className={`${FIELD_CLASS} resize-none`}
                  />
                  {createError && <p className="text-xs text-danger">{createError}</p>}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setDraftContent("");
                        setCreateError(null);
                      }}
                      disabled={savingNew}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={savingNew || !draftContent.trim()}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {savingNew ? "Guardando…" : "Guardar nota"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <PlusIcon className="size-3.5" />
                  Agregar nota
                </button>
              )}
            </div>
          )}

          {archiveError && <p className="mb-3 text-xs text-danger">{archiveError}</p>}

          {activeNotes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              Sin notas clínicas importantes
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {activeNotes.map((note) => {
                const authorId = note.updatedBy ?? note.createdBy;
                const authorName = authorId ? (nameByProfileId.get(authorId) ?? "Sin asignar") : "Sin asignar";
                const isEditing = editingId === note.id;
                const editedLabel = note.updatedBy && note.updatedAt !== note.createdAt ? "Editada" : "Creada";

                return (
                  <li key={note.id} className="rounded-lg border border-border p-3">
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={3}
                          className={`${FIELD_CLASS} resize-none`}
                        />
                        {editError && <p className="text-xs text-danger">{editError}</p>}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditError(null);
                            }}
                            disabled={savingEditId === note.id}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(note.id)}
                            disabled={savingEditId === note.id || !editDraft.trim()}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            {savingEditId === note.id ? "Guardando…" : "Guardar"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* break-words so a single long unbroken token
                            (no spaces) still wraps instead of overflowing
                            the card — same requirement this feature's own
                            "textos largos no deben romper layout" spec
                            calls out. */}
                        <p className="text-sm text-foreground break-words whitespace-pre-wrap">{note.content}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {editedLabel} {DATE_FORMATTER.format(new Date(note.updatedAt))} · {authorName}
                        </p>
                        {canEdit && (
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(note)}
                              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-foreground/80 hover:bg-foreground/5"
                            >
                              <PencilIcon className="size-3" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchive(note.id)}
                              disabled={archivingId === note.id}
                              className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-50"
                            >
                              {archivingId === note.id ? "Archivando…" : "Archivar"}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
