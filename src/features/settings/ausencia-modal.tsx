"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangleIcon, CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { createClient } from "@/lib/supabase/client";
import {
  createAbsence,
  fetchConflictingAppointments,
  updateAbsence,
  type Absence,
  type ConflictingAppointment,
} from "./absences-data";

// Real create/edit modal for an Ausencia — same shape/chrome as before
// (bottom sheet on mobile, centered card on desktop), now backed by
// professional_absences instead of simulateSave's fake local delay.
// Date-only (no allDay/startTime/endTime split anymore — see
// professional_absences' own migration comment on why): "Fecha inicial"/
// "Fecha final" are the only date inputs, matching the real table's
// minimal model exactly.
//
// Shows an honest warning (never blocks saving, never touches the
// conflicting appointments) when the chosen range already overlaps real,
// non-terminal appointments for this professional — "no borrar/mover citas
// automáticamente" (task scope): the absence still saves exactly as
// entered either way.
export function AusenciaModal({
  clinicId,
  professionalProfileId,
  editing,
  onClose,
  onCreate,
  onUpdate,
}: {
  clinicId: string;
  professionalProfileId: string;
  editing: Absence | null;
  onClose: () => void;
  onCreate: (absence: Absence) => void;
  onUpdate: (absence: Absence) => void;
}) {
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [startDate, setStartDate] = useState(editing?.startDate ?? "");
  const [endDate, setEndDate] = useState(editing?.endDate ?? editing?.startDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictingAppointment[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const validRange = Boolean(startDate) && Boolean(endDate) && endDate >= startDate;

  useEffect(() => {
    if (!validRange) return;
    let cancelled = false;
    (async () => {
      setCheckingConflicts(true);
      const supabase = createClient();
      const rows = await fetchConflictingAppointments(supabase, clinicId, professionalProfileId, startDate, endDate);
      if (!cancelled) {
        setConflicts(rows);
        setCheckingConflicts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, professionalProfileId, startDate, endDate, validRange]);

  // While the range is invalid (e.g. mid-edit), never show a stale
  // conflicts list from a previous valid range — derived at render instead
  // of resetting `conflicts` imperatively in the effect above.
  const visibleConflicts = validRange ? conflicts : [];

  const canSave = validRange && !saving;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const outcome = editing
      ? await updateAbsence(supabase, editing.id, { reason, startDate, endDate })
      : await createAbsence(supabase, { clinicId, professionalProfileId, reason, startDate, endDate });
    setSaving(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    if (editing) onUpdate(outcome.absence);
    else onCreate(outcome.absence);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Editar ausencia" : "Nueva ausencia"}
        className="relative z-10 flex w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:w-full sm:max-w-sm sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">{editing ? "Editar ausencia" : "Nueva ausencia"}</p>
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-label-foreground">Motivo (opcional)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD_CLASS} placeholder="Ej. Vacaciones" autoFocus />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Fecha inicial</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD_CLASS} required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Fecha final</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className={FIELD_CLASS}
                required
              />
            </label>
          </div>

          {!checkingConflicts && visibleConflicts.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
              <div>
                <p className="font-medium">
                  {visibleConflicts.length === 1 ? "Hay 1 cita existente" : `Hay ${visibleConflicts.length} citas existentes`} en este rango de
                  fechas.
                </p>
                <p className="mt-0.5">No se modificarán ni cancelarán automáticamente — revísalas manualmente si es necesario.</p>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar ausencia"}
          </button>
        </div>
      </form>
    </div>
  );
}
