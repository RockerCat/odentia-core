"use client";

import { useState, type FormEvent } from "react";
import { FlagIcon, PlusIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { createTreatment, renameTreatment, setTreatmentActive } from "./actions";
import type { Treatment } from "./data";

// Configuración → Tratamientos — real, tenant-scoped catalog
// (public.treatments, see the treatments migration) backing "Nueva
// cita"'s Tratamiento picker (see real-new-appointment-modal.tsx/
// real-appointment-detail-modal.tsx, which now read the active names from
// this same table instead of dashboard/mock-data.ts's old
// TREATMENT_OPTIONS). Clinic Admin only — managing this catalog is
// clinic-wide configuration (see CLAUDE.md Domain Model: Dentist "does not
// manage... clinic-wide configuration"), so this only ever mounts inside
// SettingsScreen, never DentistSettingsScreen.
//
// `canManage` is a second, real-session-derived gate (resolveClinicContext's
// role, from src/app/configuracion/page.tsx) — NOT useRole()/the mock role
// bridge that decides which Configuración screen renders (see CLAUDE.md's
// own rule: a real feature never derives permissions from the mock
// session). This is belt-and-suspenders against the DEV role switcher
// showing this admin screen to a session whose real role isn't actually
// clinic_admin; treatments_insert_admin/treatments_update_admin RLS is the
// actual enforcement either way.
//
// Same card/list visual language as ClinicSettingsScreen's own Equipo
// section (rounded-2xl card, divide-y row list, StatusBadge pill, text-xs
// actions) — reused, not redesigned. Unlike Equipo's own disabled buttons
// (waiting on a future RPC), every action here is fully wired: treatments
// has real INSERT/UPDATE RLS from day one.
export function TratamientosSection({
  clinicId,
  initialTreatments,
  canManage,
}: {
  clinicId: string | null;
  initialTreatments: Treatment[];
  canManage: boolean;
}) {
  const [treatments, setTreatments] = useState(initialTreatments);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;

  const startAdd = () => {
    setError(null);
    setNewName("");
    setAdding(true);
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewName("");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !clinicId || creating) return;
    setCreating(true);
    setError(null);
    const outcome = await createTreatment(clinicId, name);
    setCreating(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setTreatments((prev) => [...prev, outcome.treatment].sort((a, b) => a.name.localeCompare(b.name)));
    setAdding(false);
    setNewName("");
  };

  const startEdit = (treatment: Treatment) => {
    setError(null);
    setEditingId(treatment.id);
    setEditingName(treatment.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleRename = async (e: FormEvent, treatment: Treatment) => {
    e.preventDefault();
    const name = editingName.trim();
    if (!name || savingId) return;
    if (name === treatment.name) {
      cancelEdit();
      return;
    }
    setSavingId(treatment.id);
    setError(null);
    const outcome = await renameTreatment(treatment.id, name);
    setSavingId(null);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setTreatments((prev) =>
      prev.map((t) => (t.id === treatment.id ? { ...t, name } : t)).sort((a, b) => a.name.localeCompare(b.name)),
    );
    cancelEdit();
  };

  const handleToggleActive = async (treatment: Treatment) => {
    setSavingId(treatment.id);
    setError(null);
    const outcome = await setTreatmentActive(treatment.id, !treatment.active);
    setSavingId(null);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setTreatments((prev) => prev.map((t) => (t.id === treatment.id ? { ...t, active: !t.active } : t)));
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FlagIcon className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Tratamientos</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Catálogo de tratamientos disponibles al crear una cita.</p>
          </div>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={startAdd}
            disabled={!clinicId}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon className="size-3.5" />
            Agregar tratamiento
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleCreate} className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del tratamiento"
            autoFocus
            className={FIELD_CLASS}
          />
          <button
            type="submit"
            disabled={!newName.trim() || creating}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={cancelAdd}
            disabled={creating}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
          >
            Cancelar
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {treatments.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Todavía no tienes tratamientos en tu catálogo.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {treatments.map((treatment) => (
            <li key={treatment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              {editingId === treatment.id ? (
                <form onSubmit={(e) => handleRename(e, treatment)} className="flex flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    className={FIELD_CLASS}
                  />
                  <button
                    type="submit"
                    disabled={!editingName.trim() || savingId === treatment.id}
                    className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {savingId === treatment.id ? "Guardando…" : "Guardar"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={savingId === treatment.id}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <p className="min-w-0 truncate text-sm font-medium">{treatment.name}</p>
                  <div className="flex items-center gap-3">
                    <StatusBadge active={treatment.active} />
                    <button
                      type="button"
                      onClick={() => startEdit(treatment)}
                      disabled={savingId === treatment.id}
                      className="text-xs font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(treatment)}
                      disabled={savingId === treatment.id}
                      className={`text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                        treatment.active ? "text-danger/80" : "text-primary"
                      }`}
                    >
                      {savingId === treatment.id ? "Guardando…" : treatment.active ? "Desactivar" : "Reactivar"}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Same pill already used for Equipo/Mi perfil profesional's own active
// state (see ClinicSettingsScreen's own StatusBadge) — reimplemented here
// rather than imported since that one isn't exported and this is a
// separate feature folder.
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        active ? "border-primary/25 bg-primary/10 text-primary" : "border-danger/25 bg-danger/10 text-danger"
      }`}
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}
