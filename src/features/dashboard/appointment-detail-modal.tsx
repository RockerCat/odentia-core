import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Tooltip } from "@/components/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  FlagIcon,
  MapPinIcon,
  NoteIcon,
  PencilIcon,
  PhoneIcon,
  PlayCircleIcon,
  RefreshIcon,
  UserIcon,
  XCircleIcon,
} from "@/components/shell/icons";
import { AppointmentForm, type AppointmentFormMode } from "./appointment-form";
import type { Appointment, AppointmentStatus, Dentist, WeekDay } from "./mock-data";
import {
  HISTORY_STATUS_BADGE_CLASS,
  MOCK_PATIENT_HISTORY,
  STATUS_LABELS,
  STATUS_STYLES,
} from "./mock-data";
import { addMinutesToSlot, DEFAULT_APPOINTMENT_DURATION, TIME_SLOTS } from "./schedule-config";

type ModalMode = "view" | "edit" | "reschedule" | "status" | "cancel-confirm";
type SaveState = "idle" | "saving" | "success" | "error";

const FORM_ID = "appointment-detail-form";
const HISTORY_LIMIT = 5;

// This prototype phase simulates backend responses instead of calling a
// real API (see PROJECT_STATUS.md) — a fixed delay is enough to exercise
// the loading/success states realistically without real network variance.
function simulateSave<T>(result: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(result), 650));
}

const CHANGEABLE_STATUSES: AppointmentStatus[] = ["confirmed", "pending", "in-progress", "completed"];

// Orders appointments across the week (day index, then time-of-day) so
// "history" can mean "everything before this appointment," regardless of
// which day is currently selected in the board.
function chronologicalKey(item: Appointment, weekDays: WeekDay[]): number {
  const dayIndex = weekDays.findIndex((d) => d.key === item.day);
  const timeIndex = TIME_SLOTS.indexOf(item.time);
  return dayIndex * 1000 + timeIndex;
}

// Same patient, strictly earlier than the appointment being viewed, most
// recent first. Matched by patientName since this prototype has no
// dedicated patient records yet (see PROJECT_STATUS.md — Patients is a
// separate, not-yet-built milestone).
function getPatientHistory(
  allAppointments: Appointment[],
  current: Appointment,
  weekDays: WeekDay[],
): Appointment[] {
  const currentKey = chronologicalKey(current, weekDays);
  return allAppointments
    .filter((a) => a.patientName === current.patientName && a.id !== current.id)
    .filter((a) => chronologicalKey(a, weekDays) < currentKey)
    .sort((a, b) => chronologicalKey(b, weekDays) - chronologicalKey(a, weekDays))
    .slice(0, HISTORY_LIMIT);
}

export function AppointmentDetailModal({
  appointment,
  allAppointments,
  dentists,
  weekDays,
  onClose,
  onUpdate,
}: {
  appointment: Appointment;
  allAppointments: Appointment[];
  dentists: Dentist[];
  weekDays: WeekDay[];
  onClose: () => void;
  onUpdate: (updated: Appointment) => void;
}) {
  const [mode, setMode] = useState<ModalMode>("view");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [lastPatch, setLastPatch] = useState<Partial<Appointment> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const leftColumnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const requestClose = () => {
    if (saveState === "saving") return;
    if ((mode === "edit" || mode === "reschedule") && dirty) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showCloseConfirm) requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestClose closes over mode/dirty/saveState, which are already deps of the effect's own re-registration via mode/dirty/saveState below.
  }, [mode, dirty, saveState, showCloseConfirm]);

  const backToView = () => {
    setMode("view");
    setDirty(false);
    setSaveState("idle");
  };

  const handleSave = async (patch: Partial<Appointment>) => {
    setLastPatch(patch);
    setSaveState("saving");
    try {
      const updated = await simulateSave({ ...appointment, ...patch });
      onUpdate(updated);
      // Clear dirty immediately — the data is safely saved now, so closing
      // during the brief success confirmation shouldn't trigger the
      // unsaved-changes guard.
      setDirty(false);
      setSaveState("success");
      setTimeout(backToView, 700);
    } catch {
      setSaveState("error");
    }
  };

  const dentist = dentists.find((d) => d.id === appointment.dentistId);
  const day = weekDays.find((d) => d.key === appointment.day);
  const duration = appointment.durationMinutes ?? DEFAULT_APPOINTMENT_DURATION;
  const endTime = addMinutesToSlot(appointment.time, duration);
  const saving = saveState === "saving";
  let history: Appointment[] = [];
  if (mode === "view") {
    const realHistory = getPatientHistory(allAppointments, appointment, weekDays);
    // TEMPORARY fallback to mock data while real history is empty — see the
    // MOCK_PATIENT_HISTORY comment in mock-data.ts for how to remove this.
    history = realHistory.length > 0 ? realHistory : MOCK_PATIENT_HISTORY;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={requestClose}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Cita de ${appointment.patientName}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl outline-none sm:max-h-[85vh] sm:w-full sm:rounded-xl ${
          mode === "view" ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={appointment.patientName} initials={appointment.initials} sizeClassName="size-10" />
            <div>
              <p className="text-sm font-semibold">{appointment.patientName}</p>
              <span
                className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appointment.status]}`}
              >
                {STATUS_LABELS[appointment.status]}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            aria-label="Cerrar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5 disabled:opacity-40"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {mode === "view" && (
            <>
              {infoMessage && (
                <div className="px-5 pt-4">
                  <div className="flex items-start justify-between gap-2 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-xs font-medium text-info">
                    <span>{infoMessage}</span>
                    <button
                      type="button"
                      onClick={() => setInfoMessage(null)}
                      aria-label="Cerrar aviso"
                      className="shrink-0"
                    >
                      <CloseIcon className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="sm:grid sm:grid-cols-[1fr_260px]">
                <div className="px-5 py-4">
                  {/* This inner div (not the grid-cell above) is what gets
                      measured for the history panel's height budget — the
                      grid cell itself is stretched by CSS Grid's default
                      align-items:stretch to match the taller column, which
                      would make the measurement circular. */}
                  <div ref={leftColumnRef}>
                    <ViewDetails
                      appointment={appointment}
                      dentistName={dentist?.name ?? "Sin asignar"}
                      dayLabel={day ? `${day.label}, ${day.dateLabel}` : appointment.day}
                      endTime={endTime}
                      duration={duration}
                    />
                  </div>
                </div>
                <div className="border-t border-border bg-surface px-5 py-4 sm:border-t-0 sm:border-l">
                  <PatientHistoryPanel
                    history={history}
                    dentists={dentists}
                    weekDays={weekDays}
                    matchHeightRef={leftColumnRef}
                    modalRef={panelRef}
                    onItemClick={() =>
                      setInfoMessage("El detalle de esta atención estará disponible próximamente.")
                    }
                    onViewFullHistory={() =>
                      setInfoMessage("El historial completo estará disponible próximamente.")
                    }
                  />
                </div>
              </div>
            </>
          )}

          {(mode === "edit" || mode === "reschedule") && (
            <div className="px-5 py-4">
              <AppointmentForm
                mode={mode as AppointmentFormMode}
                appointment={appointment}
                dentists={dentists}
                weekDays={weekDays}
                formId={FORM_ID}
                onDirtyChange={setDirty}
                onSubmit={handleSave}
              />
            </div>
          )}

          {mode === "status" && (
            <div className="flex flex-col gap-2 px-5 py-4">
              <p className="mb-1 text-xs text-muted-foreground">Selecciona el nuevo estado de la cita.</p>
              {CHANGEABLE_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={saving || status === appointment.status}
                  onClick={() => handleSave({ status })}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    status === appointment.status
                      ? STATUS_STYLES[status]
                      : "border-border text-foreground/80 hover:bg-foreground/5"
                  }`}
                >
                  {STATUS_LABELS[status]}
                  {status === appointment.status && <span className="text-xs">Actual</span>}
                </button>
              ))}
            </div>
          )}

          {mode === "cancel-confirm" && (
            <div className="flex flex-col items-center gap-3 px-5 py-4 text-center">
              <AlertTriangleIcon className="size-8 text-danger" />
              <p className="text-sm font-medium">¿Cancelar esta cita?</p>
              <p className="text-xs text-muted-foreground">
                Se marcará como cancelada. Esta acción se puede revertir luego desde &quot;Cambiar estado&quot;.
              </p>
            </div>
          )}

          {(saveState === "saving" || saveState === "success" || saveState === "error") &&
            mode !== "view" && (
              <div
                aria-live="polite"
                className={`mx-5 mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                  saveState === "error"
                    ? "border-danger/25 bg-danger/5 text-danger"
                    : saveState === "success"
                      ? "border-success/25 bg-success/10 text-success"
                      : "border-border bg-foreground/[0.03] text-muted-foreground"
                }`}
              >
                {saveState === "saving" && (
                  <>
                    <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Guardando…
                  </>
                )}
                {saveState === "success" && (
                  <>
                    <CheckCircleIcon className="size-4 shrink-0" />
                    Cambios guardados
                  </>
                )}
                {saveState === "error" && (
                  <>
                    <AlertTriangleIcon className="size-4 shrink-0" />
                    <span className="flex-1">No se pudo guardar. Inténtalo de nuevo.</span>
                    <button
                      type="button"
                      onClick={() => lastPatch && handleSave(lastPatch)}
                      className="shrink-0 font-semibold underline underline-offset-2"
                    >
                      Reintentar
                    </button>
                  </>
                )}
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-4">
          {mode === "view" && (
            <ActionsGrid
              appointment={appointment}
              onEdit={() => setMode("edit")}
              onReschedule={() => setMode("reschedule")}
              onChangeStatus={() => setMode("status")}
              onCancelAppointment={() => setMode("cancel-confirm")}
              onViewPatient={() => setInfoMessage("La ficha del paciente estará disponible próximamente.")}
              onStartVisit={() =>
                setInfoMessage("La vista de atención clínica estará disponible próximamente.")
              }
            />
          )}

          {(mode === "edit" || mode === "reschedule") && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={backToView}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form={FORM_ID}
                disabled={saving || !dirty}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Guardar cambios
              </button>
            </div>
          )}

          {mode === "status" && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={backToView}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          )}

          {mode === "cancel-confirm" && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={backToView}
                disabled={saving}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
              >
                No, volver
              </button>
              <button
                type="button"
                onClick={() => handleSave({ status: "cancelled" })}
                disabled={saving}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Sí, cancelar cita
              </button>
            </div>
          )}
        </div>

        {/* Unsaved-changes guard — overlays the panel when the user tries
            to close while edit/reschedule has unsaved input. */}
        {showCloseConfirm && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/97 p-6 text-center">
            <AlertTriangleIcon className="size-8 text-warning" />
            <p className="text-sm font-medium">Tienes cambios sin guardar</p>
            <p className="text-xs text-muted-foreground">Si cierras ahora, perderás los cambios realizados.</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Descartar y cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ViewDetails({
  appointment,
  dentistName,
  dayLabel,
  endTime,
  duration,
}: {
  appointment: Appointment;
  dentistName: string;
  dayLabel: string;
  endTime: string;
  duration: number;
}) {
  const rows: { icon: typeof ClockIcon; label: string; value: string }[] = [
    { icon: ClockIcon, label: "Fecha", value: dayLabel },
    { icon: ClockIcon, label: "Horario", value: `${appointment.time} – ${endTime} (${duration} min)` },
    { icon: UserIcon, label: "Profesional", value: dentistName },
  ];
  if (appointment.room) rows.push({ icon: MapPinIcon, label: "Consultorio", value: appointment.room });
  rows.push({ icon: FlagIcon, label: "Tratamiento", value: appointment.type ?? "Sin definir" });
  if (appointment.patientPhone) {
    rows.push({ icon: PhoneIcon, label: "Teléfono", value: appointment.patientPhone });
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium break-words">{value}</dd>
            </div>
          </div>
        ))}
      </dl>

      {appointment.notes && (
        <div className="flex items-start gap-3 rounded-lg bg-foreground/[0.03] px-3 py-2.5">
          <NoteIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">Observaciones</p>
            <p className="text-sm">{appointment.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionsGrid({
  onEdit,
  onReschedule,
  onChangeStatus,
  onCancelAppointment,
  onViewPatient,
  onStartVisit,
}: {
  appointment: Appointment;
  onEdit: () => void;
  onReschedule: () => void;
  onChangeStatus: () => void;
  onCancelAppointment: () => void;
  onViewPatient: () => void;
  onStartVisit: () => void;
}) {
  const actions = [
    { label: "Editar cita", icon: PencilIcon, onClick: onEdit },
    { label: "Reprogramar", icon: RefreshIcon, onClick: onReschedule },
    { label: "Cambiar estado", icon: FlagIcon, onClick: onChangeStatus },
    { label: "Cancelar cita", icon: XCircleIcon, onClick: onCancelAppointment, tone: "danger" as const },
    { label: "Ver paciente", icon: UserIcon, onClick: onViewPatient },
    { label: "Iniciar atención", icon: PlayCircleIcon, onClick: onStartVisit, tone: "primary" as const },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {actions.map(({ label, icon: Icon, onClick, tone }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center text-[11px] font-medium transition-colors ${
            tone === "danger"
              ? "border-danger/20 text-danger hover:bg-danger/5"
              : tone === "primary"
                ? "border-primary/25 bg-primary/5 text-primary hover:bg-primary/10"
                : "border-border text-foreground/80 hover:bg-foreground/5"
          }`}
        >
          <Icon className="size-[18px]" />
          {label}
        </button>
      ))}
    </div>
  );
}

function PatientHistoryPanel({
  history,
  dentists,
  weekDays,
  matchHeightRef,
  modalRef,
  onItemClick,
  onViewFullHistory,
}: {
  history: Appointment[];
  dentists: Dentist[];
  weekDays: WeekDay[];
  matchHeightRef: RefObject<HTMLDivElement | null>;
  modalRef: RefObject<HTMLDivElement | null>;
  onItemClick: () => void;
  onViewFullHistory: () => void;
}) {
  const candidates = history.slice(0, HISTORY_LIMIT);
  const chromeRef = useRef<HTMLDivElement>(null);
  const measureListRef = useRef<HTMLOListElement>(null);
  const footerRef = useRef<HTMLButtonElement>(null);
  const [visibleCount, setVisibleCount] = useState(candidates.length);

  // This is a compact "quick reference" panel, not a scrollable list — it
  // shows only as many recent visits as naturally fit next to the
  // appointment info, never its own scrollbar. A hidden clone of the full
  // candidate set (below) is measured against the left column's real
  // height so the count can grow or shrink with the available space.
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
        target.getBoundingClientRect().height -
        chrome.getBoundingClientRect().height -
        footer.getBoundingClientRect().height -
        24; // the two mt-3 gaps surrounding the list
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
        {candidates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Este paciente aún no tiene historial de citas.
          </p>
        ) : (
          <ol className="flex flex-col gap-2 border-l border-border/70 pl-4">
            {visible.map((item) => (
              <HistoryEntry
                key={item.id}
                item={item}
                dentistName={dentists.find((d) => d.id === item.dentistId)?.name ?? "Sin asignar"}
                dayLabel={weekDays.find((d) => d.key === item.day)?.dateLabel ?? item.day}
                modalRef={modalRef}
                onClick={onItemClick}
              />
            ))}
          </ol>
        )}

        {/* Off-flow measurement clone of the full candidate set (up to
            HISTORY_LIMIT) — always kept in sync with `history` so a resize
            can grow the visible count back, not just shrink it. Never
            visible or interactive. */}
        <div aria-hidden="true" className="invisible absolute inset-x-0 top-0 -z-10">
          <ol ref={measureListRef} className="flex flex-col gap-2 border-l border-border/70 pl-4">
            {candidates.map((item) => (
              <HistoryEntry
                key={item.id}
                item={item}
                dentistName={dentists.find((d) => d.id === item.dentistId)?.name ?? "Sin asignar"}
                dayLabel={weekDays.find((d) => d.key === item.day)?.dateLabel ?? item.day}
                modalRef={modalRef}
                onClick={() => {}}
              />
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

function HistoryEntry({
  item,
  dentistName,
  dayLabel,
  modalRef,
  onClick,
}: {
  item: Appointment;
  dentistName: string;
  dayLabel: string;
  modalRef: RefObject<HTMLDivElement | null>;
  onClick: () => void;
}) {
  const treatmentLabel = item.status === "completed" ? "Tratamiento realizado" : "Tratamiento planeado";

  return (
    <li className="relative">
      {/* Deliberately neutral, not status-colored — the badge is the only
          place status is communicated by color here. */}
      <span
        className="absolute -left-[19px] top-1.5 size-1.5 rounded-full bg-muted-foreground/40 ring-4 ring-surface"
        aria-hidden="true"
      />
      <Tooltip
        tapToOpen
        variant="light"
        positionOutsideRef={modalRef}
        content={
          <>
            <p className="font-semibold">
              {dayLabel} · {item.time}
            </p>
            <p className="mt-0.5">{STATUS_LABELS[item.status]}</p>
            <p className="mt-1">
              {treatmentLabel}: {item.type ?? "Sin definir"}
            </p>
            <p>{dentistName}</p>
            {item.notes && <p className="mt-1 line-clamp-2 text-foreground/65">{item.notes}</p>}
          </>
        }
      >
        <button
          type="button"
          onClick={onClick}
          className="w-full rounded-lg px-2 py-1 text-left leading-tight transition-colors hover:bg-foreground/5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">
              {dayLabel} · {item.time}
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${HISTORY_STATUS_BADGE_CLASS[item.status]}`}
            >
              {STATUS_LABELS[item.status]}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{dentistName}</p>
        </button>
      </Tooltip>
    </li>
  );
}
