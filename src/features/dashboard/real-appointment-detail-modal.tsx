"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Tooltip } from "@/components/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import {
  AlertTriangleIcon,
  CalendarIcon,
  ClockIcon,
  CloseIcon,
  FlagIcon,
  MapPinIcon,
  NoteIcon,
  PencilIcon,
  PhoneIcon,
  PlayCircleIcon,
  UserIcon,
  XCircleIcon,
} from "@/components/shell/icons";
import { formatClockLabel, formatElapsed } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { FIELD_CLASS, PopoverFieldRow, TimePopoverContent } from "./appointment-detail-modal";
import {
  cancelAppointment,
  markNoShow,
  markPatientArrived,
  reactivateAppointment,
  updateAppointment,
  type AppointmentPatch,
} from "./appointments-actions";
import { fetchAppointmentsForPatient, type Appointment, type AppointmentStatus } from "./appointments-data";
import { dateKeyOf, endTimeIso, formatDateLabel, formatTimeLabel, isPastSlot } from "./real-format";
import {
  CHANGEABLE_STATUSES,
  getDisplayStatus,
  getHistoryStatusBadgeClass,
  getStatusLabel,
  getStatusStyle,
  REAL_STATUS_LABELS,
  REAL_STATUS_STYLES,
} from "./real-status";
import { getWeekDaysContaining } from "./real-week";
import { WeekDayPickerContent } from "./real-week-day-picker";

// Real /agenda appointment detail modal — a SEPARATE component from the
// still-mock appointment-detail-modal.tsx (imported by ~10 other unrelated
// still-mock screens, including the Patient Portal — never edit that file
// for this conversion). Reuses only its generic, non-data-bound UI
// primitives (AnchoredPopover/FIELD_CLASS/PopoverFieldRow/
// CalendarPopoverContent/TimePopoverContent — same pattern already used by
// src/features/patients/patient-record-modal.tsx). Everything else here is
// a fresh, real-data implementation, but the JSX/classNames/labels below
// are a deliberate 1:1 port of the approved demo's own layout — no redesign.
//
// "Iniciar atención" (ported from the demo's PlayCircleIcon/bg-primary CTA,
// same slot/classes) sets the appointment `in_progress` (real backend, via
// updateAppointment) and navigates to /agenda/atencion/[appointmentId] —
// the real, routed port of the demo's ClinicalEncounterScreen (see
// real-clinical-encounter-screen.tsx and that route's page.tsx). Earlier
// this pushed straight to /pacientes/[id]/historia-clinica instead (there
// was no real attention screen yet) — that read as a silent redirect away
// from "Iniciar atención" instead of an actual attention screen, since
// Historia Clínica ignored the appointmentId and always opened on its own
// "Resumen" tab. appointmentId is now the route param itself (not a query
// string the destination has to remember to read), so a refresh
// reconstructs the same Cita/Odontograma from Postgres, and reopening an
// `in_progress` Cita's detail and clicking again ("Continuar atención")
// lands on that exact same URL — never a second attention or a duplicate
// public.patient_clinical_encounters row.

type FieldKey = "date" | "time" | "status" | "room" | "reason" | "phone" | "notes";

const HISTORY_LIMIT = 5;

function isoDayKeyToLocalDate(dayKey: string, timeIso: string): Date {
  // dayKey: "YYYY-MM-DD" (see real-week.ts's WeekDay.key) — combined with
  // the CURRENT time-of-day portion of timeIso, in local time.
  const [y, m, d] = dayKey.split("-").map(Number);
  const time = new Date(timeIso);
  return new Date(y, m - 1, d, time.getHours(), time.getMinutes(), time.getSeconds());
}

export type BoardProfessional = {
  professionalProfileId: string;
  name: string;
  initials: string;
  specialty: string;
  avatarUrl: string | null;
};

export function RealAppointmentDetailModal({
  appointment,
  professional,
  role,
  treatmentOptions,
  roomOptions,
  onClose,
  onUpdated,
  onViewPatient,
}: {
  appointment: Appointment;
  professional: BoardProfessional | null;
  role: "clinic_admin" | "dentist" | "assistant";
  treatmentOptions: string[];
  roomOptions: string[];
  onClose: () => void;
  onUpdated: (updated: Appointment) => void;
  onViewPatient: (patientId: string) => void;
}) {
  const router = useRouter();
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [markingArrived, setMarkingArrived] = useState(false);
  const [startingEncounter, setStartingEncounter] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const isAssistant = role === "assistant";

  // Assistant's own read-only "operational monitoring" for an in-progress
  // appointment — same as the mock, informational only: there is no real
  // "attention started at" column in this iteration's schema (out of
  // scope), so "now" at mount stands in for it, same limitation the
  // approved demo already accepted. The mock's hardcoded "next appointment"
  // alert is dropped here (it named a fixed mock patient — no real
  // equivalent without fetching the professional's full day, out of scope
  // for this modal).
  const [attentionStartedAt] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const isInProgress = appointment.status === "in_progress";
  // Derived display status (see real-status.ts) — never the real DB value:
  // an in_progress Cita left running past its grace period reads as "Sin
  // cerrar" everywhere it's shown, but stays in_progress in Postgres and
  // still lets "Continuar atención" through below.
  const displayStatus = getDisplayStatus(appointment, now);
  const showAttentionTimer = isAssistant && isInProgress;
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - attentionStartedAt.getTime()) / 1000));

  useEffect(() => {
    if (!showAttentionTimer) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [showAttentionTimer]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingField !== null) {
        setEditingField(null);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, editingField]);

  const [history, setHistory] = useState<Appointment[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const rows = await fetchAppointmentsForPatient(supabase, appointment.clinicId, appointment.patientId);
        if (!cancelled) setHistory(rows.filter((a) => a.id !== appointment.id).slice(0, HISTORY_LIMIT));
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appointment.clinicId, appointment.patientId, appointment.id]);

  const handleSave = async (patch: AppointmentPatch): Promise<void> => {
    const result = await updateAppointment(appointment.id, patch);
    if (result.status === "error") throw new Error(result.message);
    onUpdated({ ...appointment, ...patch });
  };

  const duration = appointment.durationMinutes;
  const startDate = new Date(appointment.startsAt);
  const endIso = endTimeIso(appointment.startsAt, duration);
  const dayLabel = formatDateLabel(appointment.startsAt);
  const professionalName = professional?.name ?? "Sin asignar";

  const isCancelled = appointment.status === "cancelled";
  const isTerminal = isCancelled || appointment.status === "completed" || appointment.status === "no_show";
  const isUnresolved = displayStatus === "unresolved";
  const canMarkArrived = appointment.status === "confirmed" && !appointment.patientArrivedAt;
  const showReactivate = isCancelled;
  const showMarkArrived = !isCancelled && isAssistant && canMarkArrived;
  // Starting/continuing a clinical encounter is a clinical action — never
  // for Assistant (see CLAUDE.md's Roles: Assistant supports operations,
  // it doesn't attend patients). Always offered for any non-terminal Cita,
  // "Sin cerrar" included — a late start (attention did happen, just never
  // got logged) is one of the two valid ways to resolve it, see CLAUDE.md's
  // Appointment Lifecycle.
  const showStartEncounter = !isAssistant && !isTerminal;
  // The other valid resolution for a "Sin cerrar" Cita that never started
  // attention at all: the Patient genuinely never showed. Never offered for
  // one already in_progress (see real-status.ts's isUnresolved — that's the
  // OTHER "Sin cerrar" case, resolved by "Continuar atención"/"Finalizar
  // atención" instead, never "No asistió").
  const showMarkNoShow = !isAssistant && !isTerminal && !isInProgress && isUnresolved;
  const showPrimaryCta = showReactivate || showMarkArrived || showStartEncounter;
  const showCancelCta = !(isAssistant && isInProgress);
  const footerButtonCount = (showCancelCta ? 1 : 0) + (showMarkNoShow ? 1 : 0) + 1 + (showPrimaryCta ? 1 : 0);
  const footerGridClass =
    footerButtonCount === 4
      ? "grid-cols-4"
      : footerButtonCount === 3
        ? "grid-cols-3"
        : footerButtonCount === 2
          ? "grid-cols-2"
          : "grid-cols-1";

  const primaryCtaLabel = showReactivate
    ? reactivating
      ? "Reactivando…"
      : "Reactivar cita"
    : showMarkArrived
      ? markingArrived
        ? "Registrando…"
        : "Paciente llegó"
      : startingEncounter
        ? "Iniciando…"
        : isInProgress
          ? "Continuar atención"
          : "Iniciar atención";

  const handlePrimaryCta = async () => {
    setActionError(null);
    if (showReactivate) {
      setReactivating(true);
      try {
        const result = await reactivateAppointment(appointment.id);
        if (result.status === "ok") onUpdated({ ...appointment, status: "confirmed" });
        else setActionError(result.message);
      } finally {
        setReactivating(false);
      }
      return;
    }
    if (showMarkArrived) {
      setMarkingArrived(true);
      try {
        const result = await markPatientArrived(appointment.id);
        if (result.status === "ok") {
          const arrivedAt = new Date().toISOString();
          onUpdated({ ...appointment, patientArrivedAt: arrivedAt });
          setInfoMessage(`Paciente en sala de espera. Profesional: ${professionalName} · Hora: ${formatTimeLabel(appointment.startsAt)}.`);
        } else {
          setActionError(result.message);
        }
      } finally {
        setMarkingArrived(false);
      }
      return;
    }
    // showStartEncounter: move the Cita to `in_progress` (never
    // `completed` — that only happens when the clinical encounter itself
    // finishes, see CLAUDE.md) and hand off to the real attention screen
    // (/agenda/atencion/[id]). Already-in-progress appointments skip the
    // write and just continue there.
    setStartingEncounter(true);
    try {
      if (!isInProgress) {
        const result = await updateAppointment(appointment.id, { status: "in_progress" });
        if (result.status === "error") {
          setActionError(result.message);
          return;
        }
        onUpdated({ ...appointment, status: "in_progress" });
      }
      router.push(`/agenda/atencion/${appointment.id}`);
    } finally {
      setStartingEncounter(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Cita de ${appointment.patientName}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl outline-none sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:rounded-xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <UserAvatar name={appointment.patientName} initials={initialsOfName(appointment.patientName)} sizeClassName="size-10" />
            <div>
              <p className="text-sm font-semibold">{appointment.patientName}</p>
              <div className="mt-1">
                {editingField === "status" ? (
                  <InlineStatusEditor
                    current={appointment.status}
                    onSelect={async (status) => {
                      setEditingField(null);
                      setActionError(null);
                      try {
                        await handleSave({ status });
                      } catch (e) {
                        setActionError(e instanceof Error ? e.message : "No se pudo guardar. Inténtalo de nuevo.");
                      }
                    }}
                    onCancel={() => setEditingField(null)}
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusStyle(displayStatus)}`}
                    >
                      {getStatusLabel(displayStatus)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingField("status")}
                      aria-label="Cambiar estado"
                      className="text-muted-foreground/50 hover:text-primary"
                    >
                      <PencilIcon className="size-3" />
                    </button>
                  </div>
                )}
              </div>

              {appointment.patientArrivedAt && (
                <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                  En sala de espera
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        {showAttentionTimer && (
          <div className="shrink-0 border-b border-border bg-surface px-5 py-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground/80">Tiempo de atención</h3>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-info/25 bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">
                <span className="size-1.5 rounded-full bg-info" aria-hidden="true" />
                En curso
              </span>
            </div>
            <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-foreground">
              {formatElapsed(elapsedSeconds)}
            </p>
            <p className="text-[11px] text-muted-foreground">Iniciada a las {formatClockLabel(attentionStartedAt)}</p>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {actionError && (
            <div className="px-5 pt-4">
              <div className="flex items-start justify-between gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
                <span>{actionError}</span>
                <button type="button" onClick={() => setActionError(null)} aria-label="Cerrar aviso" className="shrink-0">
                  <CloseIcon className="size-3.5" />
                </button>
              </div>
            </div>
          )}
          {infoMessage && (
            <div className="px-5 pt-4">
              <div className="flex items-start justify-between gap-2 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-xs font-medium text-info">
                <span>{infoMessage}</span>
                <button type="button" onClick={() => setInfoMessage(null)} aria-label="Cerrar aviso" className="shrink-0">
                  <CloseIcon className="size-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="sm:grid sm:grid-cols-[1fr_260px]">
            <div className="px-5 py-4">
              <div ref={leftColumnRef}>
                <ViewDetails
                  appointment={appointment}
                  professionalName={professionalName}
                  dayLabel={dayLabel}
                  startDate={startDate}
                  endIso={endIso}
                  duration={duration}
                  treatmentOptions={treatmentOptions}
                  roomOptions={roomOptions}
                  editingField={editingField}
                  onStartEdit={setEditingField}
                  onCancelEdit={() => setEditingField(null)}
                  onSaveField={handleSave}
                />
              </div>
            </div>
            <div className="border-t border-border bg-surface px-5 py-4 sm:border-t-0 sm:border-l">
              <PatientHistoryPanel
                history={history}
                now={now}
                matchHeightRef={leftColumnRef}
                modalRef={panelRef}
                onItemClick={() => setInfoMessage("El detalle de esta atención estará disponible próximamente.")}
                onViewFullHistory={() => router.push(`/pacientes/${appointment.patientId}/historial-citas`)}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-4">
          <div className={`grid gap-2 ${footerGridClass}`}>
            {showCancelCta && (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="flex flex-col items-center gap-1 rounded-lg border border-danger/20 px-2 py-2.5 text-center text-[11px] font-medium text-danger transition-colors hover:bg-danger/5"
              >
                <XCircleIcon className="size-[18px]" />
                Cancelar cita
              </button>
            )}
            {showMarkNoShow && (
              <button
                type="button"
                onClick={() => setShowNoShowConfirm(true)}
                className="flex flex-col items-center gap-1 rounded-lg border border-noshow/25 px-2 py-2.5 text-center text-[11px] font-medium text-noshow transition-colors hover:bg-noshow/5"
              >
                <AlertTriangleIcon className="size-[18px]" />
                Marcar No asistió
              </button>
            )}
            <button
              type="button"
              onClick={() => onViewPatient(appointment.patientId)}
              className="flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-2.5 text-center text-[11px] font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
            >
              <UserIcon className="size-[18px]" />
              Ver paciente
            </button>
            {showPrimaryCta && (
              <button
                type="button"
                onClick={handlePrimaryCta}
                disabled={reactivating || markingArrived || startingEncounter}
                className="flex flex-col items-center gap-1 rounded-lg bg-primary px-2 py-2.5 text-center text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <PlayCircleIcon className="size-[18px]" />
                {primaryCtaLabel}
              </button>
            )}
          </div>
        </div>

        {showCancelConfirm && (
          <ConfirmActionOverlay
            title="¿Cancelar esta cita?"
            message="Se marcará como cancelada. Esta acción se puede revertir luego desde el badge de estado."
            confirmLabel="Sí, cancelar cita"
            confirmingLabel="Cancelando…"
            onCancel={() => setShowCancelConfirm(false)}
            onConfirm={async () => {
              const result = await cancelAppointment(appointment.id);
              if (result.status === "error") throw new Error(result.message);
              onUpdated({ ...appointment, status: "cancelled" });
              setShowCancelConfirm(false);
            }}
          />
        )}

        {showNoShowConfirm && (
          <ConfirmActionOverlay
            title="¿Marcar esta cita como No asistió?"
            message="Confirma que el paciente nunca llegó a esta cita. Esta acción se puede corregir luego desde el badge de estado."
            confirmLabel="Sí, marcar No asistió"
            confirmingLabel="Guardando…"
            onCancel={() => setShowNoShowConfirm(false)}
            onConfirm={async () => {
              const result = await markNoShow(appointment.id);
              if (result.status === "error") throw new Error(result.message);
              onUpdated({ ...appointment, status: "no_show" });
              setShowNoShowConfirm(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function initialsOfName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function ViewDetails({
  appointment,
  professionalName,
  dayLabel,
  startDate,
  endIso,
  duration,
  treatmentOptions,
  roomOptions,
  editingField,
  onStartEdit,
  onCancelEdit,
  onSaveField,
}: {
  appointment: Appointment;
  professionalName: string;
  dayLabel: string;
  startDate: Date;
  endIso: string;
  duration: number;
  treatmentOptions: string[];
  roomOptions: string[];
  editingField: FieldKey | null;
  onStartEdit: (field: FieldKey | null) => void;
  onCancelEdit: () => void;
  onSaveField: (patch: AppointmentPatch) => Promise<void>;
}) {
  const currentWeekDays = getWeekDaysContaining(appointment.startsAt);
  const currentDayKey = dateKeyOf(appointment.startsAt);

  return (
    <div className="flex flex-col gap-3">
      <PopoverFieldRow
        icon={ClockIcon}
        triggerIcon={CalendarIcon}
        label="Fecha"
        value={dayLabel}
        open={editingField === "date"}
        onToggle={() => onStartEdit(editingField === "date" ? null : "date")}
        onClose={onCancelEdit}
      >
        <WeekDayPickerContent
          weekDays={currentWeekDays}
          currentDayKey={currentDayKey}
          onSelect={(dayKey) => {
            onCancelEdit();
            const newStart = isoDayKeyToLocalDate(dayKey, appointment.startsAt);
            onSaveField({ startsAt: newStart.toISOString() });
          }}
        />
      </PopoverFieldRow>

      <PopoverFieldRow
        icon={ClockIcon}
        triggerIcon={ClockIcon}
        label="Horario"
        value={`${formatTimeLabel(appointment.startsAt)} – ${formatTimeLabel(endIso)} (${duration} min)`}
        open={editingField === "time"}
        onToggle={() => onStartEdit(editingField === "time" ? null : "time")}
        onClose={onCancelEdit}
      >
        <TimePopoverContent
          time={formatTimeLabel(appointment.startsAt)}
          durationMinutes={duration}
          isSlotDisabled={(slot) => isPastSlot(currentDayKey, slot)}
          onSave={async (patch) => {
            const [, hourStr, minuteStr, period] = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(patch.time) ?? [];
            let hour = Number(hourStr ?? 0) % 12;
            if (period === "PM") hour += 12;
            const newStart = new Date(startDate);
            newStart.setHours(hour, Number(minuteStr ?? 0), 0, 0);
            await onSaveField({ startsAt: newStart.toISOString(), durationMinutes: patch.durationMinutes });
            onCancelEdit();
          }}
          onCancel={onCancelEdit}
        />
      </PopoverFieldRow>

      <FieldRow icon={UserIcon} label="Profesional" value={professionalName} editing={false} />

      <FieldRow
        icon={MapPinIcon}
        label="Consultorio"
        value={appointment.room ?? "Sin asignar"}
        editing={editingField === "room"}
        onEdit={() => onStartEdit("room")}
      >
        <InlineSelectEditor
          initialValue={appointment.room ?? ""}
          options={roomOptions}
          placeholder="Sin asignar"
          onSave={async (value) => {
            await onSaveField({ room: value || null });
            onCancelEdit();
          }}
          onCancel={onCancelEdit}
        />
      </FieldRow>

      <FieldRow
        icon={FlagIcon}
        label="Tratamiento"
        value={appointment.reason ?? "Sin definir"}
        editing={editingField === "reason"}
        onEdit={() => onStartEdit("reason")}
      >
        <InlineSelectEditor
          initialValue={appointment.reason ?? ""}
          options={treatmentOptions}
          placeholder="Sin definir"
          onSave={async (value) => {
            await onSaveField({ reason: value || null });
            onCancelEdit();
          }}
          onCancel={onCancelEdit}
        />
      </FieldRow>

      <FieldRow
        icon={PhoneIcon}
        label="Teléfono"
        value={appointment.contactPhone ?? appointment.patientPhone ?? "Sin definir"}
        editing={editingField === "phone"}
        onEdit={() => onStartEdit("phone")}
      >
        <InlineTextEditor
          initialValue={appointment.contactPhone ?? appointment.patientPhone ?? ""}
          placeholder="+57 300 000 0000"
          onSave={async (value) => {
            await onSaveField({ contactPhone: value || null });
            onCancelEdit();
          }}
          onCancel={onCancelEdit}
        />
      </FieldRow>

      {(appointment.notes || editingField === "notes") && (
        <div className="rounded-lg bg-foreground/[0.03] px-3 py-2.5">
          <div className="flex items-start gap-3">
            <NoteIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] text-label-foreground">Observaciones</p>
                {editingField !== "notes" && (
                  <button
                    type="button"
                    onClick={() => onStartEdit("notes")}
                    aria-label="Editar observaciones"
                    className="text-muted-foreground/50 hover:text-primary"
                  >
                    <PencilIcon className="size-3" />
                  </button>
                )}
              </div>
              {editingField === "notes" ? (
                <InlineTextareaEditor
                  initialValue={appointment.notes ?? ""}
                  onSave={async (value) => {
                    await onSaveField({ notes: value || null });
                    onCancelEdit();
                  }}
                  onCancel={onCancelEdit}
                />
              ) : (
                <p className="text-sm">{appointment.notes}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {!appointment.notes && editingField !== "notes" && (
        <button
          type="button"
          onClick={() => onStartEdit("notes")}
          className="self-start text-[11px] font-medium text-muted-foreground/70 hover:text-primary"
        >
          + Agregar observaciones
        </button>
      )}
    </div>
  );
}

function FieldRow({
  icon: Icon,
  label,
  value,
  editing,
  onEdit,
  children,
}: {
  icon: typeof ClockIcon;
  label: string;
  value: string;
  editing: boolean;
  onEdit?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <dt className="text-[11px] text-label-foreground">{label}</dt>
          {onEdit && !editing && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Editar ${label}`}
              className="text-muted-foreground/50 hover:text-primary"
            >
              <PencilIcon className="size-3" />
            </button>
          )}
        </div>
        {editing ? children : <dd className="text-sm font-medium break-words">{value}</dd>}
      </div>
    </div>
  );
}

function InlineEditShell({
  saving,
  error,
  onCancel,
  onSave,
  children,
}: {
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {children}
      {error && <p className="text-[11px] text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function useInlineSave(onSave: (value: string) => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = async (value: string) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar. Inténtalo de nuevo.");
      setSaving(false);
    }
  };
  return { saving, error, trigger };
}

function InlineSelectEditor({
  initialValue,
  options,
  placeholder,
  onSave,
  onCancel,
}: {
  initialValue: string;
  options: string[];
  placeholder: string;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const { saving, error, trigger } = useInlineSave(onSave);
  return (
    <InlineEditShell saving={saving} error={error} onCancel={onCancel} onSave={() => trigger(value)}>
      <select value={value} onChange={(e) => setValue(e.target.value)} className={FIELD_CLASS} autoFocus>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </InlineEditShell>
  );
}

function InlineTextEditor({
  initialValue,
  placeholder,
  onSave,
  onCancel,
}: {
  initialValue: string;
  placeholder: string;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const { saving, error, trigger } = useInlineSave(onSave);
  return (
    <InlineEditShell saving={saving} error={error} onCancel={onCancel} onSave={() => trigger(value)}>
      <input
        type="tel"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={FIELD_CLASS}
        autoFocus
      />
    </InlineEditShell>
  );
}

function InlineTextareaEditor({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const { saving, error, trigger } = useInlineSave(onSave);
  return (
    <InlineEditShell saving={saving} error={error} onCancel={onCancel} onSave={() => trigger(value)}>
      <textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} className={`${FIELD_CLASS} resize-none`} autoFocus />
    </InlineEditShell>
  );
}

function InlineStatusEditor({
  current,
  onSelect,
  onCancel,
}: {
  current: AppointmentStatus;
  onSelect: (status: AppointmentStatus) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {CHANGEABLE_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            disabled={status === current}
            onClick={() => onSelect(status)}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
              status === current ? REAL_STATUS_STYLES[status] : "border-border text-foreground/70 hover:bg-foreground/5"
            }`}
          >
            {REAL_STATUS_LABELS[status]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cerrar selección de estado"
        className="self-start text-muted-foreground/60 hover:text-foreground"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  );
}

// Shared confirm-overlay shell for any destructive/final appointment
// action (Cancelar cita, Marcar No asistió) — same visual treatment for
// both, only the copy and the write differ, so the modal never grows a
// second copy of this overlay.
function ConfirmActionOverlay({
  title,
  message,
  confirmLabel,
  confirmingLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmingLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    setError(false);
    try {
      await onConfirm();
    } catch {
      setError(true);
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/97 p-6 text-center">
      <AlertTriangleIcon className="size-8 text-danger" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{message}</p>
      {error && <p className="text-xs text-danger">No se pudo guardar. Inténtalo de nuevo.</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-40"
        >
          No, volver
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving}
          className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? confirmingLabel : confirmLabel}
        </button>
      </div>
    </div>
  );
}

function PatientHistoryPanel({
  history,
  now,
  matchHeightRef,
  modalRef,
  onItemClick,
  onViewFullHistory,
}: {
  history: Appointment[] | null;
  now: Date;
  matchHeightRef: RefObject<HTMLDivElement | null>;
  modalRef: RefObject<HTMLDivElement | null>;
  onItemClick: () => void;
  onViewFullHistory: () => void;
}) {
  const candidates = history ?? [];
  const chromeRef = useRef<HTMLDivElement>(null);
  const measureListRef = useRef<HTMLOListElement>(null);
  const footerRef = useRef<HTMLButtonElement>(null);
  const [visibleCount, setVisibleCount] = useState(candidates.length);

  useLayoutEffect(() => {
    const recalc = () => {
      const isDesktop = window.matchMedia("(min-width: 640px)").matches;
      const chrome = chromeRef.current;
      const footer = footerRef.current;
      const target = matchHeightRef.current;
      const list = measureListRef.current;
      if (!isDesktop || !chrome || !footer || !target || !list) {
        setVisibleCount(candidates.length);
        return;
      }

      const available =
        target.getBoundingClientRect().height - chrome.getBoundingClientRect().height - footer.getBoundingClientRect().height - 24;
      const listTop = list.getBoundingClientRect().top;

      let fitCount = 0;
      for (const child of Array.from(list.children)) {
        const bottom = (child as HTMLElement).getBoundingClientRect().bottom - listTop;
        if (bottom <= available) fitCount += 1;
        else break;
      }
      setVisibleCount(fitCount);
    };

    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [candidates.length, matchHeightRef]);

  const visible = candidates.slice(0, visibleCount);

  return (
    <div className="flex h-full flex-col">
      <div ref={chromeRef}>
        <h3 className="text-sm font-semibold">Historial de citas</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Últimas atenciones del paciente</p>
      </div>

      <div className="relative mt-3 flex-1 overflow-hidden">
        {history === null ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Cargando historial…
          </p>
        ) : candidates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Este paciente aún no tiene historial de citas.
          </p>
        ) : (
          <ol className="flex flex-col gap-2 border-l border-border/70 pl-4">
            {visible.map((item) => (
              <RealHistoryEntry key={item.id} item={item} now={now} modalRef={modalRef} onClick={onItemClick} />
            ))}
          </ol>
        )}

        <div aria-hidden="true" className="invisible absolute inset-x-0 top-0 -z-10">
          <ol ref={measureListRef} className="flex flex-col gap-2 border-l border-border/70 pl-4">
            {candidates.map((item) => (
              <RealHistoryEntry key={item.id} item={item} now={now} modalRef={modalRef} onClick={() => {}} />
            ))}
          </ol>
        </div>
      </div>

      <button
        ref={footerRef}
        type="button"
        onClick={onViewFullHistory}
        className="mt-3 w-full rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
      >
        Ver historial completo
      </button>
    </div>
  );
}

// Local port of appointment-detail-modal.tsx's HistoryEntry — reimplemented
// rather than imported since the real Appointment has no .day/.time/.type/
// .dentistId (uses .startsAt/.reason instead); dentist name is omitted from
// this row (unlike the mock) since fetchAppointmentsForPatient doesn't join
// professional info and this modal only carries the CURRENT appointment's
// professional — a minor, deliberate trim, not a redesign of the row itself.
function RealHistoryEntry({
  item,
  now,
  modalRef,
  onClick,
}: {
  item: Appointment;
  now: Date;
  modalRef: RefObject<HTMLDivElement | null>;
  onClick: () => void;
}) {
  const displayStatus = getDisplayStatus(item, now);
  const treatmentLabel = item.status === "completed" ? "Tratamiento realizado" : "Tratamiento planeado";
  const dayLabel = formatDateLabel(item.startsAt);
  const timeLabel = formatTimeLabel(item.startsAt);

  return (
    <li className="relative">
      <span className="absolute -left-[19px] top-1.5 size-1.5 rounded-full bg-muted-foreground/40 ring-4 ring-surface" aria-hidden="true" />
      <Tooltip
        tapToOpen
        variant="light"
        positionOutsideRef={modalRef}
        content={
          <>
            <p className="font-semibold">
              {dayLabel} · {timeLabel}
            </p>
            <p className="mt-0.5">{getStatusLabel(displayStatus)}</p>
            <p className="mt-1">
              {treatmentLabel}: {item.reason ?? "Sin definir"}
            </p>
            {item.notes && <p className="mt-1 line-clamp-2 text-foreground/65">{item.notes}</p>}
          </>
        }
      >
        <button type="button" onClick={onClick} className="w-full rounded-lg px-2 py-1 text-left leading-tight transition-colors hover:bg-foreground/5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-label-foreground">
              {dayLabel} · {timeLabel}
            </span>
            <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${getHistoryStatusBadgeClass(displayStatus)}`}>
              {getStatusLabel(displayStatus)}
            </span>
          </div>
        </button>
      </Tooltip>
    </li>
  );
}
