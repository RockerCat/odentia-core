import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Tooltip } from "@/components/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import {
  AlertTriangleIcon,
  CalendarIcon,
  ChevronIcon,
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
import type { Appointment, AppointmentStatus, Dentist, WeekDay } from "./mock-data";
import {
  DURATION_OPTIONS,
  HISTORY_STATUS_BADGE_CLASS,
  MOCK_PATIENT_HISTORY,
  ROOMS,
  STATUS_LABELS,
  STATUS_STYLES,
  TREATMENT_OPTIONS,
} from "./mock-data";
import { addMinutesToSlot, DEFAULT_APPOINTMENT_DURATION, TIME_SLOTS } from "./schedule-config";

// DEV TOOL — Assistant's read-only "operational monitoring" for an
// in-progress appointment (see showAttentionTimer below). Same mocked
// "next appointment ~5 min out" trick as ClinicalEncounterScreen, kept
// short so the alert is reachable while testing instead of requiring a
// wait tied to a real future appointment — see that file's identical
// comment for the full rationale.
const MOCK_NEXT_PATIENT_NAME = "Andrés Bermúdez";
const NEXT_APPOINTMENT_OFFSET_MINUTES = 5;
const NEXT_APPOINTMENT_ALERT_THRESHOLD_MS = 5 * 60_000;

// Which single field (if any) is currently expanded into its inline
// editor. Only one at a time — keeps the interaction simple and
// unambiguous, and matches "convertir únicamente ese campo en editable."
type FieldKey = "date" | "time" | "status" | "room" | "type" | "phone" | "notes";

const HISTORY_LIMIT = 5;
// Exported so the new-appointment modal can reuse the exact same field
// styling, popover fields (Fecha/Horario), and simulated-save helper —
// "misma experiencia y lenguaje visual del modal de detalle" per its spec.
export const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none";

// This prototype phase simulates backend responses instead of calling a
// real API (see PROJECT_STATUS.md) — a fixed delay is enough to exercise
// the loading/success states realistically without real network variance.
export function simulateSave<T>(result: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(result), 650));
}

const CHANGEABLE_STATUSES: AppointmentStatus[] = ["confirmed", "pending", "in-progress", "completed"];

// This prototype's mock data only models a single fixed week (see
// WEEK_DAYS in mock-data.ts) — August 3–9, 2026. The date popover still
// renders a real, fully-navigable month grid (so it looks and behaves
// like an actual datepicker), but only days within that supported week
// are selectable; everything else is shown disabled rather than silently
// producing an appointment the rest of the app has no data for.
const REFERENCE_MONTH = new Date(2026, 7, 1);

const WEEKDAY_HEADERS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });

// Capitalizes only the leading character — CSS `capitalize` would also
// title-case the "de" connector ("Agosto De 2026"), which isn't correct
// Spanish.
function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// A Monday-first 6-week (42-cell) grid covering the given month, including
// the leading/trailing days from adjacent months a real datepicker shows.
function buildMonthGrid(viewMonth: Date): Date[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const leadingOffset = (firstOfMonth.getDay() + 6) % 7; // getDay(): 0=Sun..6=Sat
  const gridStart = new Date(year, month, 1 - leadingOffset);
  return Array.from(
    { length: 42 },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  );
}

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
export function getPatientHistory(
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
  onStartEncounter,
}: {
  appointment: Appointment;
  allAppointments: Appointment[];
  dentists: Dentist[];
  weekDays: WeekDay[];
  onClose: () => void;
  onUpdate: (updated: Appointment) => void;
  onStartEncounter: () => void;
}) {
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [markingArrived, setMarkingArrived] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const leftColumnRef = useRef<HTMLDivElement>(null);
  // DEV TOOL — see src/dev/role.ts. An Assistant handles scheduling/front
  // desk work but never clinical attention (see CLAUDE.md Domain Model).
  const { role } = useRole();
  const isAssistant = role === "assistant";

  // DEV TOOL — Assistant's read-only operational timer (see
  // showAttentionTimer below). This modal has no access to the clinical
  // encounter's real start time (that state lives only inside
  // ClinicalEncounterScreen and isn't persisted anywhere shared), so — like
  // that screen's own next-appointment mock — "now" at mount stands in for
  // it; harmless for this iteration since it's purely informational.
  const [attentionStartedAt] = useState(() => new Date());
  const [nextAppointmentAt] = useState(
    () => new Date(attentionStartedAt.getTime() + NEXT_APPOINTMENT_OFFSET_MINUTES * 60_000),
  );
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Inline edits are small and cheap to redo, so closing never needs to
  // guard against losing them. Escape closes whichever field/popover is
  // currently open first (standard picker/dropdown behavior), and only
  // closes the whole modal once nothing is mid-edit — no confirmation
  // dialog either way, there's nothing worth losing that couldn't be
  // redone in a couple of clicks.
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

  const handleSave = async (patch: Partial<Appointment>) => {
    const updated = await simulateSave({ ...appointment, ...patch });
    onUpdate(updated);
  };

  const dentist = dentists.find((d) => d.id === appointment.dentistId);
  const day = weekDays.find((d) => d.key === appointment.day);
  const duration = appointment.durationMinutes ?? DEFAULT_APPOINTMENT_DURATION;
  const endTime = addMinutesToSlot(appointment.time, duration);
  const dentistName = dentist?.name ?? "Sin asignar";

  // The footer's single CTA slot is exactly one of three things, depending
  // on state/role — never more than one at a time:
  //  1. Reactivate a cancelled appointment — an operational action anyone
  //     can do (Assistant included).
  //  2. "Paciente llegó" — Assistant's own operational check-in action,
  //     shown once the appointment is confirmed and not yet arrived. This
  //     only ever sets `waitingRoom` (see mock-data.ts), never `status` —
  //     the clinical/scheduling state machine stays untouched.
  //  3. Open the clinical encounter screen — every role except Assistant,
  //     who never gets clinical actions (see CLAUDE.md Domain Model).
  const isCancelled = appointment.status === "cancelled";
  const isInProgress = appointment.status === "in-progress";
  const canMarkArrived = appointment.status === "confirmed" && !appointment.waitingRoom;
  const showReactivate = isCancelled;
  const showMarkArrived = !isCancelled && isAssistant && canMarkArrived;
  const showStartEncounter = !isCancelled && !isAssistant;
  const showPrimaryCta = showReactivate || showMarkArrived || showStartEncounter;
  // An Assistant can't cancel an appointment that already started clinical
  // attention — everyone else's ability to cancel is unchanged.
  const showCancelCta = !(isAssistant && isInProgress);
  const footerButtonCount = (showCancelCta ? 1 : 0) + 1 + (showPrimaryCta ? 1 : 0);
  const footerGridClass =
    footerButtonCount === 3 ? "grid-cols-3" : footerButtonCount === 2 ? "grid-cols-2" : "grid-cols-1";

  const primaryCtaLabel = showReactivate
    ? reactivating
      ? "Reactivando…"
      : "Reactivar cita"
    : showMarkArrived
      ? markingArrived
        ? "Registrando…"
        : "Paciente llegó"
      : "Iniciar atención";

  const handlePrimaryCta = async () => {
    if (showReactivate) {
      setReactivating(true);
      try {
        await handleSave({ status: "confirmed" });
      } finally {
        setReactivating(false);
      }
      return;
    }
    if (showMarkArrived) {
      setMarkingArrived(true);
      try {
        await handleSave({ waitingRoom: true });
        setInfoMessage(`Paciente en sala de espera. Profesional: ${dentistName} · Hora: ${appointment.time}.`);
      } finally {
        setMarkingArrived(false);
      }
      return;
    }
    onStartEncounter();
  };

  // Assistant's own compact, read-only "operational monitoring" — kept
  // completely separate from the clinical flow above (see CLAUDE.md Domain
  // Model): no pause/reset/edit controls, just a live clock and, if the
  // same dentist's next appointment is close, the same alert already used
  // in the clinical encounter screen.
  const showAttentionTimer = isAssistant && isInProgress;
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - attentionStartedAt.getTime()) / 1000));
  const remainingMs = nextAppointmentAt.getTime() - now.getTime();
  const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  const nextAppointmentDue = remainingMs <= NEXT_APPOINTMENT_ALERT_THRESHOLD_MS;
  const nextAppointmentMessage =
    remainingMs <= 0 ? "La próxima cita comienza ahora." : `Próxima cita en ${remainingMinutes} min`;

  useEffect(() => {
    if (!showAttentionTimer) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [showAttentionTimer]);

  const realHistory = getPatientHistory(allAppointments, appointment, weekDays);
  // TEMPORARY fallback to mock data while real history is empty — see the
  // MOCK_PATIENT_HISTORY comment in mock-data.ts for how to remove this.
  const history = realHistory.length > 0 ? realHistory : MOCK_PATIENT_HISTORY;

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
            <UserAvatar name={appointment.patientName} initials={appointment.initials} sizeClassName="size-10" />
            <div>
              <p className="text-sm font-semibold">{appointment.patientName}</p>
              <div className="mt-1">
                {editingField === "status" ? (
                  <InlineStatusEditor
                    current={appointment.status}
                    onSelect={(status) => {
                      setEditingField(null);
                      handleSave({ status });
                    }}
                    onCancel={() => setEditingField(null)}
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appointment.status]}`}
                    >
                      {STATUS_LABELS[appointment.status]}
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

              {/* Operational "front desk" state — deliberately separate from
                  the clinical status pill above (see waitingRoom on
                  Appointment in mock-data.ts). The action that sets it lives
                  in the footer's primary CTA (Assistant's "Paciente llegó");
                  this badge is just the always-visible read of that state,
                  for every role — e.g. the assigned Dentist sees it too. */}
              {appointment.waitingRoom && (
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

        {/* Assistant's operational monitoring — read-only, separate from
            the clinical status pill above (see showAttentionTimer). */}
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

            {nextAppointmentDue && (
              <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                <ClockIcon className="mt-0.5 size-3.5 shrink-0" />
                <div>
                  <p className="font-medium">{nextAppointmentMessage}</p>
                  <p className="mt-0.5 text-warning/80">
                    {MOCK_NEXT_PATIENT_NAME} · {formatClockLabel(nextAppointmentAt)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
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
                  weekDays={weekDays}
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
        </div>

        {/* Footer — only the actions that genuinely need a dedicated step;
            everything else is now edited inline above. */}
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
            <button
              type="button"
              onClick={() => setInfoMessage("La ficha del paciente estará disponible próximamente.")}
              className="flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-2.5 text-center text-[11px] font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
            >
              <UserIcon className="size-[18px]" />
              Ver paciente
            </button>
            {showPrimaryCta && (
              <button
                type="button"
                onClick={handlePrimaryCta}
                disabled={reactivating || markingArrived}
                className="flex flex-col items-center gap-1 rounded-lg bg-primary px-2 py-2.5 text-center text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <PlayCircleIcon className="size-[18px]" />
                {primaryCtaLabel}
              </button>
            )}
          </div>
        </div>

        {showCancelConfirm && (
          <CancelConfirmOverlay
            onCancel={() => setShowCancelConfirm(false)}
            onConfirm={async () => {
              await handleSave({ status: "cancelled" });
              setShowCancelConfirm(false);
            }}
          />
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
  weekDays,
  editingField,
  onStartEdit,
  onCancelEdit,
  onSaveField,
}: {
  appointment: Appointment;
  dentistName: string;
  dayLabel: string;
  endTime: string;
  duration: number;
  weekDays: WeekDay[];
  editingField: FieldKey | null;
  onStartEdit: (field: FieldKey | null) => void;
  onCancelEdit: () => void;
  onSaveField: (patch: Partial<Appointment>) => Promise<void>;
}) {
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
        <CalendarPopoverContent
          weekDays={weekDays}
          currentDay={appointment.day}
          onSelect={(dayKey) => {
            onCancelEdit();
            onSaveField({ day: dayKey });
          }}
        />
      </PopoverFieldRow>

      <PopoverFieldRow
        icon={ClockIcon}
        triggerIcon={ClockIcon}
        label="Horario"
        value={`${appointment.time} – ${endTime} (${duration} min)`}
        open={editingField === "time"}
        onToggle={() => onStartEdit(editingField === "time" ? null : "time")}
        onClose={onCancelEdit}
      >
        <TimePopoverContent
          time={appointment.time}
          durationMinutes={duration}
          onSave={async (patch) => {
            await onSaveField(patch);
            onCancelEdit();
          }}
          onCancel={onCancelEdit}
        />
      </PopoverFieldRow>

      <FieldRow icon={UserIcon} label="Profesional" value={dentistName} editing={false} />

      <FieldRow
        icon={MapPinIcon}
        label="Consultorio"
        value={appointment.room ?? "Sin asignar"}
        editing={editingField === "room"}
        onEdit={() => onStartEdit("room")}
      >
        <InlineSelectEditor
          initialValue={appointment.room ?? ""}
          options={ROOMS}
          placeholder="Sin asignar"
          onSave={async (value) => {
            await onSaveField({ room: value || undefined });
            onCancelEdit();
          }}
          onCancel={onCancelEdit}
        />
      </FieldRow>

      <FieldRow
        icon={FlagIcon}
        label="Tratamiento"
        value={appointment.type ?? "Sin definir"}
        editing={editingField === "type"}
        onEdit={() => onStartEdit("type")}
      >
        <InlineSelectEditor
          initialValue={appointment.type ?? ""}
          options={TREATMENT_OPTIONS}
          placeholder="Sin definir"
          onSave={async (value) => {
            await onSaveField({ type: value || undefined });
            onCancelEdit();
          }}
          onCancel={onCancelEdit}
        />
      </FieldRow>

      <FieldRow
        icon={PhoneIcon}
        label="Teléfono"
        value={appointment.patientPhone ?? "Sin definir"}
        editing={editingField === "phone"}
        onEdit={() => onStartEdit("phone")}
      >
        <InlineTextEditor
          initialValue={appointment.patientPhone ?? ""}
          placeholder="+57 300 000 0000"
          onSave={async (value) => {
            await onSaveField({ patientPhone: value || undefined });
            onCancelEdit();
          }}
          onCancel={onCancelEdit}
        />
      </FieldRow>

      {appointment.notes && (
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
                  initialValue={appointment.notes}
                  onSave={async (value) => {
                    await onSaveField({ notes: value || undefined });
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
    </div>
  );
}

function FieldRow({
  icon: Icon,
  editTriggerIcon: EditIcon = PencilIcon,
  label,
  value,
  editing,
  onEdit,
  children,
}: {
  icon: typeof ClockIcon;
  editTriggerIcon?: typeof ClockIcon;
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
              <EditIcon className="size-3" />
            </button>
          )}
        </div>
        {editing ? children : <dd className="text-sm font-medium break-words">{value}</dd>}
      </div>
    </div>
  );
}

// Row shell for the two popover-driven fields (Fecha, Horario) — unlike
// the other fields' in-place editors, the value here always stays
// visible and the editor floats in a panel anchored to the trigger icon.
export function PopoverFieldRow({
  icon: Icon,
  triggerIcon: TriggerIcon,
  label,
  value,
  valueClassName = "",
  open,
  onToggle,
  onClose,
  popoverWidthClass,
  children,
}: {
  icon: typeof ClockIcon;
  triggerIcon: typeof ClockIcon;
  label: string;
  value: string;
  // Optional extra classes for the value text — e.g. the new-appointment
  // modal uses this to highlight a value pre-filled from a calendar slot
  // click in the brand's primary color until the user edits it.
  valueClassName?: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  popoverWidthClass?: string;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <dt className="text-[11px] text-label-foreground">{label}</dt>
          <button
            ref={triggerRef}
            type="button"
            onClick={onToggle}
            aria-label={`Editar ${label}`}
            aria-expanded={open}
            className="text-muted-foreground/50 hover:text-primary"
          >
            <TriggerIcon className="size-3" />
          </button>
        </div>
        <dd className={`text-sm font-medium break-words ${valueClassName}`}>{value}</dd>
      </div>
      <AnchoredPopover open={open} anchorRef={triggerRef} onClose={onClose} widthClass={popoverWidthClass}>
        {children}
      </AnchoredPopover>
    </div>
  );
}

// Positions a floating panel just below (or above, if that runs off-screen)
// the given anchor element, clamped to stay fully within the viewport, and
// closes on any click/tap outside itself and the anchor. Exported so other
// features (e.g. the Agenda's filter chips) can reuse the same positioning.
export function AnchoredPopover({
  open,
  anchorRef,
  onClose,
  widthClass = "w-64",
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  widthClass?: string;
  children: ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const MARGIN = 8;
  const GAP = 6;

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    let top = anchorRect.bottom + GAP;
    if (top + popoverRect.height + MARGIN > window.innerHeight) {
      top = anchorRect.top - popoverRect.height - GAP;
    }
    top = Math.min(Math.max(top, MARGIN), window.innerHeight - popoverRect.height - MARGIN);

    const left = Math.min(
      Math.max(anchorRect.left, MARGIN),
      window.innerWidth - popoverRect.width - MARGIN,
    );

    setPosition({ top, left });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      style={position ?? { top: 0, left: -9999 }}
      className={`fixed z-30 ${widthClass} rounded-lg border border-border bg-background p-3 shadow-lg`}
    >
      {children}
    </div>
  );
}

export function CalendarPopoverContent({
  weekDays,
  currentDay,
  onSelect,
}: {
  weekDays: WeekDay[];
  currentDay: string;
  onSelect: (dayKey: string) => void;
}) {
  const [viewMonth, setViewMonth] = useState(REFERENCE_MONTH);

  // All 7 supported days fall within REFERENCE_MONTH in this single-week
  // prototype — see the REFERENCE_MONTH comment above for why.
  const selectableDates = weekDays.map((day) => ({
    key: day.key,
    date: new Date(REFERENCE_MONTH.getFullYear(), REFERENCE_MONTH.getMonth(), Number(day.dateNumber)),
  }));

  const cells = buildMonthGrid(viewMonth);

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          aria-label="Mes anterior"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/5"
        >
          <ChevronIcon className="size-3.5" />
        </button>
        <span className="text-xs font-semibold">{capitalizeFirst(MONTH_LABEL_FORMATTER.format(viewMonth))}</span>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          aria-label="Mes siguiente"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/5"
        >
          <ChevronIcon className="size-3.5 rotate-180" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-y-1">
        {WEEKDAY_HEADERS.map((label) => (
          <span key={label} className="text-center text-[10px] font-medium text-muted-foreground">
            {label}
          </span>
        ))}
        {cells.map((cell) => {
          const inViewMonth = cell.getMonth() === viewMonth.getMonth();
          const match = selectableDates.find((s) => isSameDate(s.date, cell));
          const active = match?.key === currentDay;
          return (
            <button
              key={cell.toISOString()}
              type="button"
              disabled={!match}
              onClick={() => match && onSelect(match.key)}
              className={`mx-auto flex size-7 items-center justify-center rounded-full text-xs transition-colors ${
                active
                  ? "bg-primary font-semibold text-primary-foreground"
                  : match
                    ? "text-foreground hover:bg-primary/10"
                    : `cursor-default ${inViewMonth ? "text-muted-foreground/40" : "text-muted-foreground/20"}`
              }`}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TimePopoverContent({
  time,
  durationMinutes,
  onSave,
  onCancel,
}: {
  time: string;
  durationMinutes: number;
  onSave: (patch: { time: string; durationMinutes: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [localTime, setLocalTime] = useState(time);
  const [localDuration, setLocalDuration] = useState(durationMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const handleSaveClick = async () => {
    setSaving(true);
    setError(false);
    try {
      await onSave({ time: localTime, durationMinutes: localDuration });
    } catch {
      setError(true);
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="text-[11px] text-label-foreground" htmlFor="time-popover-start">
          Hora de inicio
        </label>
        <select
          id="time-popover-start"
          value={localTime}
          onChange={(e) => setLocalTime(e.target.value)}
          className={`${FIELD_CLASS} mt-1`}
        >
          {TIME_SLOTS.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[11px] text-label-foreground" htmlFor="time-popover-duration">
          Duración
        </label>
        <select
          id="time-popover-duration"
          value={localDuration}
          onChange={(e) => setLocalDuration(Number(e.target.value))}
          className={`${FIELD_CLASS} mt-1`}
        >
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} min
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-[11px] text-danger">No se pudo guardar. Inténtalo de nuevo.</p>}
      <div className="flex items-center justify-end gap-2 pt-0.5">
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
          onClick={handleSaveClick}
          disabled={saving}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

// Shared save/error/actions chrome for the single-value inline editors
// below — each just supplies its own input control as children.
function InlineEditShell({
  saving,
  error,
  onCancel,
  onSave,
  children,
}: {
  saving: boolean;
  error: boolean;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {children}
      {error && <p className="text-[11px] text-danger">No se pudo guardar. Inténtalo de nuevo.</p>}
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
  const [error, setError] = useState(false);
  const trigger = async (value: string) => {
    setSaving(true);
    setError(false);
    try {
      await onSave(value);
    } catch {
      setError(true);
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
      <textarea
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`${FIELD_CLASS} resize-none`}
        autoFocus
      />
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
              status === current ? STATUS_STYLES[status] : "border-border text-foreground/70 hover:bg-foreground/5"
            }`}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cerrar selección de estado"
        // Icon-only on purpose — a text "Cancelar" here reads as the same
        // action as the footer's "Cancelar cita" button, which it isn't:
        // this just closes the inline status picker without changing anything.
        className="self-start text-muted-foreground/60 hover:text-foreground"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  );
}

function CancelConfirmOverlay({
  onCancel,
  onConfirm,
}: {
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
      <p className="text-sm font-medium">¿Cancelar esta cita?</p>
      <p className="text-xs text-muted-foreground">
        Se marcará como cancelada. Esta acción se puede revertir luego desde el badge de estado.
      </p>
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
          {saving ? "Cancelando…" : "Sí, cancelar cita"}
        </button>
      </div>
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
            <span className="text-[11px] font-medium text-label-foreground">
              {dayLabel} · {item.time}
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${HISTORY_STATUS_BADGE_CLASS[item.status]}`}
            >
              {STATUS_LABELS[item.status]}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-label-foreground">{dentistName}</p>
        </button>
      </Tooltip>
    </li>
  );
}
