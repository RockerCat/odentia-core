"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { recordRipsExportResultAction, type RipsExportHistoryEntry } from "./export-actions";

// RIPS #5B — the ONLY UI that writes a MUV result, and only after the
// odontóloga performed the real manual upload herself (this task's own
// Sections 9/10). Deliberately not called "Validar": Odentia never
// executes the validation, it only records what already happened
// externally. Same modal chrome as ausencia-modal.tsx (bottom sheet on
// mobile, centered card on desktop) — no shared generic Modal component
// exists in this codebase yet, so this follows that established pattern
// rather than inventing a new one.

type ResultChoice = "accepted" | "rejected";

export function RecordRipsResultModal({
  entry,
  onClose,
  onRecorded,
}: {
  entry: RipsExportHistoryEntry;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [result, setResult] = useState<ResultChoice>("accepted");
  const [cuv, setCuv] = useState("");
  const [procesoId, setProcesoId] = useState("");
  const [radicacionAt, setRadicacionAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = result === "accepted" ? cuv.trim().length > 0 : notes.trim().length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const outcome = await recordRipsExportResultAction(
      result === "accepted"
        ? {
            exportId: entry.id,
            result: "accepted",
            cuv: cuv.trim(),
            procesoId: procesoId.trim() || undefined,
            radicacionAt: radicacionAt || undefined,
          }
        : { exportId: entry.id, result: "rejected", notes: notes.trim() },
    );
    setSaving(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    onRecorded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Registrar resultado del MUV"
        className="relative z-10 flex w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:w-full sm:max-w-sm sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Registrar resultado del MUV</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="text-xs text-muted-foreground">
            {entry.periodLabel} · generado con {entry.patientCount} paciente(s). Registra aquí lo que obtuviste al cargar manualmente este archivo
            en el Mecanismo Único de Validación.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setResult("accepted")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                result === "accepted" ? "border-success bg-success/10 text-success" : "border-border text-foreground/70"
              }`}
            >
              Aceptado
            </button>
            <button
              type="button"
              onClick={() => setResult("rejected")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                result === "rejected" ? "border-danger bg-danger/10 text-danger" : "border-border text-foreground/70"
              }`}
            >
              Rechazado
            </button>
          </div>

          {result === "accepted" ? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">CUV (Código Único de Validación)</span>
                <input value={cuv} onChange={(e) => setCuv(e.target.value)} className={FIELD_CLASS} placeholder="Pega aquí el CUV" autoFocus />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">ProcesoId (opcional)</span>
                <input value={procesoId} onChange={(e) => setProcesoId(e.target.value)} className={FIELD_CLASS} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">Fecha de radicación (opcional)</span>
                <input type="date" value={radicacionAt} onChange={(e) => setRadicacionAt(e.target.value)} className={FIELD_CLASS} />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Resumen del rechazo</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${FIELD_CLASS} min-h-24 resize-none`}
                placeholder="Describe brevemente el motivo o el error reportado por el MUV"
                autoFocus
              />
            </label>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSave || saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar resultado"}
          </button>
        </div>
      </form>
    </div>
  );
}
