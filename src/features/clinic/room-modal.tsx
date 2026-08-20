"use client";

import { useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS, simulateSave } from "@/features/dashboard/appointment-detail-modal";
import type { ClinicRoom } from "./mock-data";

// Deliberately a single-field form — "mantener esta gestión simple para
// MVP" (see task scope). Same modal handles both "+ Agregar consultorio"
// and "Editar" (editing !== null), matching the create/edit pairing
// pattern in team-member-modal.tsx.
export function RoomModal({
  editing,
  onClose,
  onCreate,
  onUpdate,
}: {
  editing: ClinicRoom | null;
  onClose: () => void;
  onCreate: (room: ClinicRoom) => void;
  onUpdate: (room: ClinicRoom) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [saving, setSaving] = useState(false);

  const canSave = Boolean(name.trim()) && !saving;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const room = await simulateSave<ClinicRoom>({
      id: editing?.id ?? `new-room-${Date.now()}`,
      name: name.trim(),
      status: editing?.status ?? "active",
    });
    if (editing) onUpdate(room);
    else onCreate(room);
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
        aria-label={editing ? "Editar consultorio" : "Agregar consultorio"}
        className="relative z-10 flex w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:w-full sm:max-w-sm sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">{editing ? "Editar consultorio" : "Agregar consultorio"}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-label-foreground">Nombre del consultorio</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD_CLASS}
              placeholder="Ej. Consultorio 4"
              required
              autoFocus
            />
          </label>
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
            {saving ? "Guardando…" : editing ? "Guardar cambios" : "Agregar consultorio"}
          </button>
        </div>
      </form>
    </div>
  );
}
