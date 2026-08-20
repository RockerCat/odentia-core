"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS, simulateSave } from "@/features/dashboard/appointment-detail-modal";
import type { Absence } from "./dentist-mock-data";
import { ToggleSwitch } from "./toggle-switch";

// Compact create/edit modal for an Ausencia — same shape as room-modal.tsx/
// team-member-modal.tsx (bottom sheet on mobile, centered card on desktop).
// No validation against existing appointments yet (see task scope).
export function AusenciaModal({
  editing,
  onClose,
  onCreate,
  onUpdate,
}: {
  editing: Absence | null;
  onClose: () => void;
  onCreate: (absence: Absence) => void;
  onUpdate: (absence: Absence) => void;
}) {
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [startDate, setStartDate] = useState(editing?.startDate ?? "");
  const [endDate, setEndDate] = useState(editing?.endDate ?? editing?.startDate ?? "");
  const [allDay, setAllDay] = useState(editing?.allDay ?? true);
  const [startTime, setStartTime] = useState(editing?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(editing?.endTime ?? "17:00");
  const [saving, setSaving] = useState(false);

  const canSave = Boolean(reason.trim()) && Boolean(startDate) && Boolean(endDate) && !saving;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const absence = await simulateSave<Absence>({
      id: editing?.id ?? `new-absence-${Date.now()}`,
      reason: reason.trim(),
      startDate,
      endDate,
      allDay,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
    });
    if (editing) onUpdate(absence);
    else onCreate(absence);
    setSaving(false);
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
            <span className="text-label-foreground">Motivo</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={FIELD_CLASS}
              placeholder="Ej. Vacaciones"
              required
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-label-foreground">Fecha inicial</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={FIELD_CLASS}
                required
              />
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

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">Todo el día</span>
            <ToggleSwitch label="Todo el día" checked={allDay} onChange={() => setAllDay((prev) => !prev)} />
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">Hora inicio</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={FIELD_CLASS}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-label-foreground">Hora fin</span>
                <input
                  type="time"
                  value={endTime}
                  min={startTime || undefined}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={FIELD_CLASS}
                  required
                />
              </label>
            </div>
          )}
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
