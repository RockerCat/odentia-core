"use client";

import { useState } from "react";
import { CloseIcon, PencilIcon, PlusIcon } from "@/components/shell/icons";
import { useToast } from "@/components/toast";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import type { Treatment } from "@/features/treatments/data";
import {
  createTreatmentPlanItem,
  updateTreatmentPlanItem,
  updateTreatmentPlanItemStatus,
} from "./treatment-plan-actions";
import { ACTIVE_TREATMENT_STATUSES, type TreatmentPlanItem, type TreatmentPlanItemStatus } from "./treatment-plan-data";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });

const STATUS_LABELS: Record<TreatmentPlanItemStatus, string> = {
  planned: "Planeado",
  in_progress: "En progreso",
  completed: "Completado",
  cancelled: "Cancelado",
};

const STATUS_STYLES: Record<TreatmentPlanItemStatus, string> = {
  planned: "border-warning/25 bg-warning/10 text-warning",
  in_progress: "border-info/25 bg-info/10 text-info",
  completed: "border-primary/25 bg-primary/10 text-primary",
  cancelled: "border-danger/20 bg-danger/5 text-danger/70",
};

type ViewFilter = "active" | "completed" | "cancelled" | "all";

function matchesFilter(item: TreatmentPlanItem, filter: ViewFilter): boolean {
  if (filter === "active") return ACTIVE_TREATMENT_STATUSES.includes(item.status);
  if (filter === "completed") return item.status === "completed";
  if (filter === "cancelled") return item.status === "cancelled";
  return true;
}

// "Ver plan de tratamiento" — full CRUD surface for Historia Clínica →
// Resumen's "Tratamientos activos" card. canEdit gates create/edit/status
// change (Asistente sees a read-only list — see clinical-permissions.ts's
// canEditClinicalData), the same way ClinicalNotesModal/DocumentosTab
// already gate their own write UI; the real enforcement boundary is still
// the RPCs themselves (is_active_clinical_professional), never this prop
// alone. Activos/Completados/Cancelados/Todos filter — same shape as
// DocumentosTab's own ArchiveFilter — so completed/cancelled items are
// never mixed into the active view, but nothing is ever hidden entirely.
export function TreatmentPlanModal({
  patientId,
  items,
  treatmentOptions,
  canEdit,
  onClose,
  onChanged,
}: {
  patientId: string;
  items: TreatmentPlanItem[];
  treatmentOptions: Treatment[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: (items: TreatmentPlanItem[]) => void;
}) {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<ViewFilter>("active");
  const filteredItems = items.filter((item) => matchesFilter(item, filter));

  const [creating, setCreating] = useState(false);
  const [draftTreatmentId, setDraftTreatmentId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTreatmentId, setEditTreatmentId] = useState("");
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const resetCreateForm = () => {
    setCreating(false);
    setDraftTreatmentId("");
    setDraftName("");
    setDraftNotes("");
    setCreateError(null);
  };

  const handleCreate = async () => {
    const name = draftName.trim();
    if (!name || savingNew) return;
    setSavingNew(true);
    setCreateError(null);
    const outcome = await createTreatmentPlanItem({
      patientId,
      treatmentId: draftTreatmentId || null,
      treatmentName: name,
      notes: draftNotes.trim() || null,
    });
    setSavingNew(false);
    if (outcome.status === "error") {
      setCreateError(outcome.message);
      return;
    }
    onChanged([...items, outcome.item]);
    showToast("Tratamiento agregado correctamente");
    resetCreateForm();
  };

  const startEdit = (item: TreatmentPlanItem) => {
    setEditingId(item.id);
    setEditTreatmentId(item.treatmentId ?? "");
    setEditName(item.treatmentName);
    setEditNotes(item.notes ?? "");
    setEditError(null);
  };

  const handleSaveEdit = async (itemId: string) => {
    const name = editName.trim();
    if (!name || savingEditId) return;
    setSavingEditId(itemId);
    setEditError(null);
    const outcome = await updateTreatmentPlanItem({
      itemId,
      treatmentId: editTreatmentId || null,
      treatmentName: name,
      notes: editNotes.trim() || null,
    });
    setSavingEditId(null);
    if (outcome.status === "error") {
      setEditError(outcome.message);
      return;
    }
    onChanged(items.map((i) => (i.id === outcome.item.id ? outcome.item : i)));
    showToast("Tratamiento actualizado correctamente");
    setEditingId(null);
  };

  const handleChangeStatus = async (itemId: string, status: TreatmentPlanItemStatus) => {
    if (changingStatusId) return;
    setChangingStatusId(itemId);
    setStatusError(null);
    const outcome = await updateTreatmentPlanItemStatus(itemId, status);
    setChangingStatusId(null);
    if (outcome.status === "error") {
      setStatusError(outcome.message);
      return;
    }
    onChanged(items.map((i) => (i.id === outcome.item.id ? outcome.item : i)));
    showToast("Estado actualizado correctamente");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Plan de tratamiento"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-xl sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Plan de tratamiento</p>
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
          <div className="mb-3 flex gap-1 rounded-lg border border-border p-0.5 text-xs">
            {(
              [
                { value: "active", label: "Activos" },
                { value: "completed", label: "Completados" },
                { value: "cancelled", label: "Cancelados" },
                { value: "all", label: "Todos" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-colors ${
                  filter === opt.value ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-foreground/5"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {canEdit && (
            <div className="mb-4">
              {creating ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-label-foreground">Del catálogo (opcional)</span>
                    <select
                      value={draftTreatmentId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setDraftTreatmentId(id);
                        const picked = treatmentOptions.find((t) => t.id === id);
                        if (picked) setDraftName(picked.name);
                      }}
                      className={FIELD_CLASS}
                    >
                      <option value="">Sin definir (texto libre)</option>
                      {treatmentOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-label-foreground">Nombre del tratamiento</span>
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Ej. Endodoncia molar 36"
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-label-foreground">Notas (opcional)</span>
                    <textarea
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      rows={2}
                      className={`${FIELD_CLASS} resize-none`}
                    />
                  </label>
                  {createError && <p className="text-xs text-danger">{createError}</p>}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={resetCreateForm}
                      disabled={savingNew}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={savingNew || !draftName.trim()}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {savingNew ? "Guardando…" : "Guardar tratamiento"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <PlusIcon className="size-3.5" />
                  Agregar tratamiento
                </button>
              )}
            </div>
          )}

          {statusError && <p className="mb-3 text-xs text-danger">{statusError}</p>}

          {filteredItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              {filter === "active" ? "Sin tratamientos activos" : "Sin tratamientos en esta vista"}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {filteredItems.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <li key={item.id} className="rounded-lg border border-border p-3">
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <select
                          value={editTreatmentId}
                          onChange={(e) => {
                            const id = e.target.value;
                            setEditTreatmentId(id);
                            const picked = treatmentOptions.find((t) => t.id === id);
                            if (picked) setEditName(picked.name);
                          }}
                          className={FIELD_CLASS}
                        >
                          <option value="">Sin definir (texto libre)</option>
                          {treatmentOptions.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className={FIELD_CLASS} />
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={2}
                          placeholder="Notas (opcional)"
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
                            disabled={savingEditId === item.id}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                            disabled={savingEditId === item.id || !editName.trim()}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            {savingEditId === item.id ? "Guardando…" : "Guardar"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground break-words">{item.treatmentName}</p>
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[item.status]}`}
                          >
                            {STATUS_LABELS[item.status]}
                          </span>
                        </div>
                        {item.notes && <p className="mt-1.5 text-sm text-foreground/80 break-words whitespace-pre-wrap">{item.notes}</p>}
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Agregado {DATE_FORMATTER.format(new Date(item.createdAt))}
                        </p>
                        {canEdit && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-foreground/80 hover:bg-foreground/5"
                            >
                              <PencilIcon className="size-3" />
                              Editar
                            </button>
                            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              Estado
                              <select
                                value={item.status}
                                disabled={changingStatusId === item.id}
                                onChange={(e) => handleChangeStatus(item.id, e.target.value as TreatmentPlanItemStatus)}
                                className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground/80 disabled:opacity-50"
                              >
                                {(Object.keys(STATUS_LABELS) as TreatmentPlanItemStatus[]).map((s) => (
                                  <option key={s} value={s}>
                                    {STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                              {changingStatusId === item.id && <span>Guardando…</span>}
                            </label>
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
