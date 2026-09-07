"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { createClient } from "@/lib/supabase/client";
import {
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  fetchWeeklyAvailability,
  setAvailabilityBlockActive,
  WEEKDAY_LABELS,
  type WeeklyAvailabilityBlock,
} from "./availability-data";
import { ToggleSwitch } from "./toggle-switch";

// Real Horario/Disponibilidad editor — the "1. HORARIO / DISPONIBILIDAD DEL
// PROFESIONAL" block. Shared by the Clinic Admin's Configuración (any
// professional, via the same selector as Ausencias — see
// ausencias-admin-section.tsx) and the Dentist's own Configuración (herself
// only, no selector needed — see dentist-settings-screen.tsx). Self-fetches
// on mount and whenever professionalProfileId changes, same pattern as
// RealAppointmentDetailModal's own patient-history fetch — the only way a
// single component works for both "admin switches selection" and "dentist
// viewing her own, once" without either caller managing fetch state itself.
//
// professional_availability's own RLS (can_manage_professional_schedule) is
// the real enforcement of who may write which professional's schedule —
// this component never assumes canEdit is trustworthy on its own, but does
// use it to decide whether to render the add-block form/toggle/delete
// controls at all (an Assistant, or a Dentist viewing someone else's — the
// latter never actually reachable today since the admin selector is
// clinic_admin-only, but the prop still exists for correctness).
export function HorarioEditor({
  clinicId,
  professionalProfileId,
  canEdit,
}: {
  clinicId: string;
  professionalProfileId: string;
  canEdit: boolean;
}) {
  const { showToast } = useToast();
  const [blocks, setBlocks] = useState<WeeklyAvailabilityBlock[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [adding, setAdding] = useState(false);

  // professionalProfileId is stable for this component's whole lifetime in
  // both real callers (DentistSettingsScreen: always self; the Clinic
  // Admin's ProfessionalSchedulePanel remounts this whole subtree via its
  // own key={professionalProfileId} on selection change — see
  // disponibilidad-admin-section.tsx) — so this effect only ever runs
  // once per mount, never needs to reset blocks/loadError back to their
  // initial values first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const rows = await fetchWeeklyAvailability(supabase, professionalProfileId);
        if (!cancelled) setBlocks(rows);
      } catch {
        if (!cancelled) {
          setBlocks([]);
          setLoadError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [professionalProfileId]);

  const withPending = (id: string, active: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (adding) return;
    setActionError(null);
    setAdding(true);
    const supabase = createClient();
    const outcome = await createAvailabilityBlock(supabase, { clinicId, professionalProfileId, dayOfWeek, startTime, endTime });
    setAdding(false);
    if (outcome.status === "error") {
      setActionError(outcome.message);
      return;
    }
    setBlocks((prev) => [...(prev ?? []), outcome.block]);
    showToast("Horario actualizado correctamente");
  };

  const handleToggleActive = async (block: WeeklyAvailabilityBlock) => {
    if (pendingIds.has(block.id)) return;
    withPending(block.id, true);
    const supabase = createClient();
    const outcome = await setAvailabilityBlockActive(supabase, block.id, !block.active);
    withPending(block.id, false);
    if (outcome.status === "error") {
      setActionError(outcome.message);
      return;
    }
    setBlocks((prev) => (prev ?? []).map((b) => (b.id === block.id ? { ...b, active: !b.active } : b)));
    showToast("Horario actualizado correctamente");
  };

  const handleDelete = async (block: WeeklyAvailabilityBlock) => {
    if (pendingIds.has(block.id)) return;
    withPending(block.id, true);
    const supabase = createClient();
    const outcome = await deleteAvailabilityBlock(supabase, block.id);
    withPending(block.id, false);
    if (outcome.status === "error") {
      setActionError(outcome.message);
      return;
    }
    setBlocks((prev) => (prev ?? []).filter((b) => b.id !== block.id));
    showToast("Bloque de horario eliminado");
  };

  if (blocks === null) {
    return <p className="mt-3 text-sm text-muted-foreground">Cargando horario…</p>;
  }

  return (
    <div className="mt-3">
      {loadError && <p className="mb-2 text-xs text-danger">No pudimos cargar el horario. Intenta de nuevo más tarde.</p>}
      {actionError && <p className="mb-2 text-xs text-danger">{actionError}</p>}

      {blocks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-sm text-muted-foreground">
          Horario aún no configurado.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {WEEKDAY_LABELS.map((label, index) => {
            const dow = index + 1;
            const dayBlocks = blocks.filter((b) => b.dayOfWeek === dow);
            if (dayBlocks.length === 0) return null;
            return (
              <li key={dow} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <p className="w-24 shrink-0 text-sm font-medium text-foreground">{label}</p>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {dayBlocks.map((block) => (
                    <div key={block.id} className="flex items-center justify-between gap-3">
                      <span className={`text-sm ${block.active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                        {block.startTime} – {block.endTime}
                      </span>
                      {canEdit && (
                        <div className="flex shrink-0 items-center gap-2">
                          <ToggleSwitch
                            label={`Bloque activo ${label} ${block.startTime}-${block.endTime}`}
                            checked={block.active}
                            onChange={() => handleToggleActive(block)}
                          />
                          <button
                            type="button"
                            onClick={() => handleDelete(block)}
                            disabled={pendingIds.has(block.id)}
                            className="text-xs font-medium text-danger/80 hover:text-danger disabled:opacity-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-label-foreground">Día</span>
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={FIELD_CLASS} disabled={adding}>
              {WEEKDAY_LABELS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-label-foreground">Hora inicio</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={FIELD_CLASS} disabled={adding} required />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-label-foreground">Hora fin</span>
            <input type="time" value={endTime} min={startTime} onChange={(e) => setEndTime(e.target.value)} className={FIELD_CLASS} disabled={adding} required />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {adding ? "Agregando…" : "Agregar bloque"}
          </button>
        </form>
      )}
    </div>
  );
}
