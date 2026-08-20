"use client";

import { useState } from "react";
import { ProfessionalSelect } from "@/components/professional-select";
import { CloseIcon } from "@/components/shell/icons";
import { chronologicalKey, WEEK_DAYS, type Appointment, type Dentist } from "@/features/dashboard/mock-data";

// Programada/Confirmada are the only two states that actually need
// reassigning before deactivating (see task scope) — everything else
// (Completada/Cancelada/No asistió) is history and never blocks anything,
// and "Paciente llegó"/"En sala de espera"/"En curso" block outright
// rather than being reassignable (see blockingLabel below).
const REASSIGNABLE_LABELS: Partial<Record<Appointment["status"], string>> = {
  pending: "Programada",
  confirmed: "Confirmada",
};

function isBlocking(a: Appointment): boolean {
  return Boolean(a.waitingRoom) || a.status === "in-progress";
}

function isReassignable(a: Appointment): boolean {
  return !isBlocking(a) && (a.status === "pending" || a.status === "confirmed");
}

function blockingLabel(a: Appointment): string {
  return a.status === "in-progress" ? "En curso" : "Paciente llegó / en sala de espera";
}

function dayLabel(a: Appointment): string {
  return WEEK_DAYS.find((d) => d.key === a.day)?.label ?? a.day;
}

type MemberStatusModalProps = {
  action: "deactivate" | "reactivate";
  kind: "dentist" | "assistant";
  memberId: string;
  memberName: string;
  // Only meaningful for kind === "dentist" && action === "deactivate" —
  // see task scope: Asistentes have no citas of their own to check/reassign.
  appointments?: Appointment[];
  activeDentists?: Dentist[];
  onClose: () => void;
  onConfirm: () => void;
};

// The one place Activo/Inactivo actually changes for Equipo (see task
// scope — Perfil del profesional's own Estado is now purely informational).
// Not opened for Asistentes' reassignment step: they carry no appointments
// of their own, so deactivating one is always the simple confirm below.
export function MemberStatusModal({
  action,
  kind,
  memberId,
  memberName,
  appointments = [],
  activeDentists = [],
  onClose,
  onConfirm,
}: MemberStatusModalProps) {
  const [reassignedIds, setReassignedIds] = useState<Set<string>>(new Set());
  const [reassigning, setReassigning] = useState(false);
  const [targetDentistId, setTargetDentistId] = useState("");

  const isDentistDeactivate = kind === "dentist" && action === "deactivate";
  const relevant = isDentistDeactivate ? appointments.filter((a) => a.dentistId === memberId) : [];
  const blocking = relevant.filter(isBlocking);
  const reassignable = relevant.filter((a) => isReassignable(a) && !reassignedIds.has(a.id));
  const nextAppointment = [...reassignable].sort(
    (a, b) => chronologicalKey(a, WEEK_DAYS) - chronologicalKey(b, WEEK_DAYS),
  )[0];
  const targetDentist = activeDentists.find((d) => d.id === targetDentistId);

  const step: "confirm" | "blocked" | "pending" | "reassigning" = !isDentistDeactivate
    ? "confirm"
    : blocking.length > 0
      ? "blocked"
      : reassigning
        ? "reassigning"
        : reassignable.length > 0
          ? "pending"
          : "confirm";

  const handleConfirmReassignment = () => {
    if (!targetDentistId) return;
    setReassignedIds((prev) => {
      const next = new Set(prev);
      reassignable.forEach((a) => next.add(a.id));
      return next;
    });
    setReassigning(false);
    setTargetDentistId("");
  };

  const title =
    action === "reactivate" ? "Reactivar" : step === "blocked" ? "No se puede desactivar" : step === "reassigning" ? "Reasignar citas" : "Desactivar";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} ${memberName}`}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[80vh] sm:w-full sm:max-w-sm sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">{title}</p>
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
          {action === "reactivate" && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium">¿Reactivar a {memberName}?</p>
              <p className="text-muted-foreground">Volverá a estar disponible para agenda y asignaciones.</p>
            </div>
          )}

          {action === "deactivate" && kind === "assistant" && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium">¿Desactivar a {memberName}?</p>
              <p className="text-muted-foreground">Dejará de estar disponible en el equipo. Su información se conserva.</p>
            </div>
          )}

          {step === "blocked" && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="rounded-lg border border-warning/25 bg-warning/10 p-3">
                <p className="font-medium text-warning">
                  {blocking.length} atención{blocking.length > 1 ? "es" : ""} en curso o con paciente en sala.
                </p>
                <p className="mt-1 text-xs text-warning/90">
                  Resuelve esa atención desde la Agenda antes de desactivar a {memberName}.
                </p>
              </div>
              <ul className="flex flex-col gap-1.5">
                {blocking.map((a) => (
                  <li key={a.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                    <p className="font-medium">
                      {dayLabel(a)} · {a.time} — {a.patientName}
                    </p>
                    <p className="text-muted-foreground">{blockingLabel(a)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === "pending" && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium">
                {memberName} tiene {reassignable.length} cita{reassignable.length > 1 ? "s" : ""} próxima
                {reassignable.length > 1 ? "s" : ""} asignada{reassignable.length > 1 ? "s" : ""}.
              </p>
              {nextAppointment && (
                <p className="text-muted-foreground">
                  Próxima cita: {dayLabel(nextAppointment)}, {nextAppointment.time} — {nextAppointment.patientName}
                  {" · "}
                  {REASSIGNABLE_LABELS[nextAppointment.status]}
                </p>
              )}
              <p className="text-muted-foreground">Debes reasignarlas a otro profesional antes de desactivar.</p>
            </div>
          )}

          {step === "reassigning" && (
            <div className="flex flex-col gap-3 text-sm">
              <p className="font-medium">
                Reasignar {reassignable.length} cita{reassignable.length > 1 ? "s" : ""} a otro profesional
              </p>
              <ProfessionalSelect
                dentists={activeDentists}
                selectedId={targetDentistId}
                onSelect={setTargetDentistId}
                placeholder="Buscar profesional…"
              />
              {targetDentist && (
                <p className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs text-primary">
                  Se reasignarán {reassignable.length} cita{reassignable.length > 1 ? "s" : ""} a {targetDentist.name}.
                </p>
              )}
            </div>
          )}

          {step === "confirm" && isDentistDeactivate && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium">¿Desactivar a {memberName}?</p>
              <p className="text-muted-foreground">
                Dejará de estar disponible para nuevas citas. Su historial clínico, atenciones y reportes se conservan.
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          {step === "blocked" ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5"
            >
              Cerrar
            </button>
          ) : step === "reassigning" ? (
            <>
              <button
                type="button"
                onClick={() => setReassigning(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReassignment}
                disabled={!targetDentistId}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Confirmar reasignación
              </button>
            </>
          ) : step === "pending" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setReassigning(true)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Reasignar citas
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 ${
                  action === "reactivate" ? "bg-primary" : "bg-danger"
                }`}
              >
                {action === "reactivate" ? "Reactivar" : "Desactivar"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
