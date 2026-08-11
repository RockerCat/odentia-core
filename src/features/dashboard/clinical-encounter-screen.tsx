"use client"; // owns the encounter draft's local state (notes, procedures, dialogs)

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { UserAvatar } from "@/components/user-avatar";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronIcon,
  ClipboardIcon,
  ClockIcon,
  CloseIcon,
  FlagIcon,
  NoteIcon,
  PhoneIcon,
  PlusIcon,
  ToothIcon,
  UserIcon,
} from "@/components/shell/icons";
import { AppointmentDetailModal, FIELD_CLASS, getPatientHistory, simulateSave } from "./appointment-detail-modal";
import type { Appointment, Dentist, WeekDay } from "./mock-data";
import {
  MOCK_PATIENT_HISTORY,
  PROCEDURE_OPTIONS,
  STATUS_LABELS,
  STATUS_STYLES,
  TREATMENT_OPTIONS,
} from "./mock-data";
import { NewAppointmentModal } from "./new-appointment-modal";
import { OdontogramModal } from "./odontogram-modal";
import type { OdontogramData } from "./odontogram-teeth";
import { OdontogramPreview } from "./odontogram-teeth";
import { addMinutesToSlot, DEFAULT_APPOINTMENT_DURATION } from "./schedule-config";
import { formatClockLabel, formatElapsed } from "@/lib/format";

type ProcedureRow = { id: string; name: string; note: string };

// Mocked "next appointment" for the same professional, used to demo the
// live countdown alert below — see NEXT_APPOINTMENT_OFFSET_MINUTES. No
// backend/schedule lookup yet; this iteration is visual-only.
const MOCK_NEXT_PATIENT_NAME = "Andrés Bermúdez";
// Kept short (~5 min from encounter start) so the alert is reachable while
// testing, instead of requiring a wait tied to a real future appointment.
const NEXT_APPOINTMENT_OFFSET_MINUTES = 5;
const NEXT_APPOINTMENT_ALERT_THRESHOLD_MS = 5 * 60_000;

export function ClinicalEncounterScreen({
  appointment,
  dentists,
  allAppointments,
  weekDays,
  onExit,
  onComplete,
  onCreateAppointment,
  onUpdateAppointment,
}: {
  appointment: Appointment;
  dentists: Dentist[];
  allAppointments: Appointment[];
  weekDays: WeekDay[];
  onExit: () => void;
  onComplete: () => void;
  onCreateAppointment: (appointment: Appointment) => void;
  onUpdateAppointment: (appointment: Appointment) => void;
}) {
  const [notes, setNotes] = useState("");
  const [indications, setIndications] = useState("");
  const [procedures, setProcedures] = useState<ProcedureRow[]>([]);
  const [needsNextAppointment, setNeedsNextAppointment] = useState<boolean | null>(null);
  const [nextTreatment, setNextTreatment] = useState("");
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [odontogram, setOdontogram] = useState<OdontogramData>({});
  const [odontogramOpen, setOdontogramOpen] = useState(false);
  const [timerVisible, setTimerVisible] = useState(true);
  const [showNewAppointmentModal, setShowNewAppointmentModal] = useState(false);
  const [scheduledNextAppointment, setScheduledNextAppointment] = useState<Appointment | null>(null);
  const [viewingScheduledAppointment, setViewingScheduledAppointment] = useState(false);
  const [startedAt] = useState(() => new Date());
  const [nextAppointmentAt] = useState(() => new Date(startedAt.getTime() + NEXT_APPOINTMENT_OFFSET_MINUTES * 60_000));
  const [now, setNow] = useState(() => new Date());
  const nextProcedureId = useRef(0);

  // Drives both the elapsed-time counter and the next-appointment countdown
  // from a single ticking clock — visual only, nothing persisted.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showNewAppointmentModal) {
        setShowNewAppointmentModal(false);
        return;
      }
      if (viewingScheduledAppointment) {
        setViewingScheduledAppointment(false);
        return;
      }
      if (odontogramOpen) {
        setOdontogramOpen(false);
        return;
      }
      if (showFinalizeConfirm) {
        setShowFinalizeConfirm(false);
        return;
      }
      onExit();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onExit, showFinalizeConfirm, odontogramOpen, showNewAppointmentModal, viewingScheduledAppointment]);

  const addProcedure = () => {
    nextProcedureId.current += 1;
    setProcedures((prev) => [...prev, { id: `proc-${nextProcedureId.current}`, name: "", note: "" }]);
  };

  const updateProcedure = (id: string, patch: Partial<ProcedureRow>) => {
    setProcedures((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removeProcedure = (id: string) => {
    setProcedures((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    await simulateSave(null);
    setSavingDraft(false);
    setInfoMessage("Borrador guardado.");
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    await simulateSave(null);
    setFinalizing(false);
    setShowFinalizeConfirm(false);
    onComplete();
  };

  const dentist = dentists.find((d) => d.id === appointment.dentistId);
  const day = weekDays.find((d) => d.key === appointment.day);
  const dayLabel = day ? `${day.label}, ${day.dateLabel}` : appointment.day;
  const duration = appointment.durationMinutes ?? DEFAULT_APPOINTMENT_DURATION;
  const endTime = addMinutesToSlot(appointment.time, duration);
  const realHistory = getPatientHistory(allAppointments, appointment, weekDays);
  // Same TEMPORARY fallback as AppointmentDetailModal's history panel — see
  // the MOCK_PATIENT_HISTORY comment in mock-data.ts.
  const history = realHistory.length > 0 ? realHistory : MOCK_PATIENT_HISTORY;

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
  const remainingMs = nextAppointmentAt.getTime() - now.getTime();
  const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  const nextAppointmentDue = remainingMs <= NEXT_APPOINTMENT_ALERT_THRESHOLD_MS;
  const nextAppointmentMessage =
    remainingMs <= 0 ? "La próxima cita comienza ahora." : `Próxima cita en ${remainingMinutes} min`;
  const hasAlerts = Boolean(appointment.notes) || nextAppointmentDue;

  const scheduledDay = scheduledNextAppointment
    ? weekDays.find((d) => d.key === scheduledNextAppointment.day)
    : undefined;
  const scheduledDayLabel = scheduledNextAppointment
    ? (scheduledDay ? `${scheduledDay.label}, ${scheduledDay.dateLabel}` : scheduledNextAppointment.day)
    : "";
  const scheduledDentistName = scheduledNextAppointment
    ? (dentists.find((d) => d.id === scheduledNextAppointment.dentistId)?.name ?? "Sin asignar")
    : "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <ChevronIcon className="size-4" />
          Volver a Agenda
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-info/25 bg-info/10 px-2.5 py-1 text-xs font-medium text-info">
          <span className="size-1.5 rounded-full bg-info" aria-hidden="true" />
          En atención
        </span>
      </header>

      {/* Resumen superior */}
      <div className="shrink-0 border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={appointment.patientName} initials={appointment.initials} sizeClassName="size-11" />
            <div>
              <p className="text-sm font-semibold">{appointment.patientName}</p>
              <p className="text-xs text-muted-foreground">{appointment.type ?? "Sin tratamiento definido"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground sm:ml-auto">
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" />
              {dayLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <ClockIcon className="size-3.5" />
              {appointment.time} – {endTime}
            </span>
            <span className="flex items-center gap-1.5">
              <UserIcon className="size-3.5" />
              {dentist?.name ?? "Sin asignar"}
            </span>
          </div>
        </div>
      </div>

      {/* Subtle green-gray tint distinguishes the workspace from the white
          header/cards without the color becoming dominant. */}
      <div className="flex-1 overflow-y-auto bg-[#F4F7F6]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          {infoMessage && (
            <div className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-xs font-medium text-info">
              <span>{infoMessage}</span>
              <button type="button" onClick={() => setInfoMessage(null)} aria-label="Cerrar aviso" className="shrink-0">
                <CloseIcon className="size-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-6">
              <Section title="Notas de atención" icon={NoteIcon}>
                <RichTextEditor
                  value={notes}
                  onChange={setNotes}
                  placeholder="Describe lo observado y realizado durante la atención…"
                />
              </Section>

              <Section title="Procedimientos realizados" icon={ClipboardIcon}>
                <div className="flex flex-col gap-2.5">
                  {procedures.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      Aún no se han agregado procedimientos.
                    </p>
                  )}
                  {procedures.map((proc) => (
                    <div key={proc.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <select
                          value={proc.name}
                          onChange={(e) => updateProcedure(proc.id, { name: e.target.value })}
                          className={FIELD_CLASS}
                        >
                          <option value="">Selecciona un procedimiento</option>
                          {PROCEDURE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={proc.note}
                          onChange={(e) => updateProcedure(proc.id, { note: e.target.value })}
                          placeholder="Observación (opcional)"
                          className={FIELD_CLASS}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProcedure(proc.id)}
                        aria-label="Quitar procedimiento"
                        className="mt-1.5 shrink-0 text-muted-foreground/60 hover:text-danger"
                      >
                        <CloseIcon className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addProcedure}
                    className="flex items-center justify-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  >
                    <PlusIcon className="size-3.5" />
                    Agregar procedimiento
                  </button>
                </div>
              </Section>

              <Section title="Odontograma" icon={ToothIcon}>
                <div className="rounded-lg border border-dashed border-border px-4 py-4">
                  <OdontogramPreview odontogram={odontogram} />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">
                      {Object.keys(odontogram).length > 0
                        ? `${Object.keys(odontogram).length} pieza(s) con hallazgos registrados.`
                        : "Registra hallazgos por diente durante la atención."}
                    </p>
                    <button
                      type="button"
                      onClick={() => setOdontogramOpen(true)}
                      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
                    >
                      Abrir odontograma
                    </button>
                  </div>
                </div>
              </Section>

              <Section title="Indicaciones al paciente" icon={FlagIcon}>
                <RichTextEditor
                  value={indications}
                  onChange={setIndications}
                  placeholder="Recomendaciones, cuidados o medicamentos indicados…"
                />
              </Section>

              <Section title="Próxima cita" icon={CalendarIcon}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {([true, false] as const).map((option) => (
                      <button
                        key={String(option)}
                        type="button"
                        onClick={() => setNeedsNextAppointment(option)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          needsNextAppointment === option
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border text-foreground/70 hover:bg-foreground/5"
                        }`}
                      >
                        {option ? "Sí" : "No"}
                      </button>
                    ))}
                  </div>
                  {needsNextAppointment && (
                    <>
                      <div>
                        <label className="text-[11px] text-label-foreground" htmlFor="next-treatment">
                          Tratamiento recomendado
                        </label>
                        <select
                          id="next-treatment"
                          value={nextTreatment}
                          onChange={(e) => setNextTreatment(e.target.value)}
                          className={`${FIELD_CLASS} mt-1`}
                        >
                          <option value="">Selecciona un tratamiento</option>
                          {TREATMENT_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>

                      {scheduledNextAppointment ? (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                          <p className="text-xs font-medium text-primary">Próxima cita agendada</p>
                          <p className="mt-1 text-xs text-foreground/80">
                            {scheduledDayLabel} · {scheduledNextAppointment.time} ·{" "}
                            {scheduledNextAppointment.type ?? "Sin tratamiento definido"} · {scheduledDentistName}
                          </p>
                          <button
                            type="button"
                            onClick={() => setViewingScheduledAppointment(true)}
                            className="mt-2 text-xs font-medium text-primary hover:underline"
                          >
                            Ver o modificar cita
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowNewAppointmentModal(true)}
                          className="flex items-center justify-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        >
                          <PlusIcon className="size-3.5" />
                          Agendar próxima cita
                        </button>
                      )}
                    </>
                  )}
                </div>
              </Section>
            </div>

            {/* Columna contextual — solo desktop */}
            <aside className="hidden lg:flex lg:flex-col lg:gap-5">
              <div className="rounded-xl border border-border bg-background p-4">
                <h3 className="text-sm font-semibold">Información del paciente</h3>
                <div className="mt-3 flex items-center gap-3">
                  <UserAvatar name={appointment.patientName} initials={appointment.initials} sizeClassName="size-10" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{appointment.patientName}</p>
                    {appointment.patientPhone && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <PhoneIcon className="size-3" />
                        {appointment.patientPhone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {timerVisible ? (
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Tiempo de atención</h3>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                        En curso
                      </span>
                      <button
                        type="button"
                        onClick={() => setTimerVisible(false)}
                        aria-label="Ocultar tiempo de atención"
                        className="text-muted-foreground/50 hover:text-foreground"
                      >
                        <CloseIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-foreground">
                    {formatElapsed(elapsedSeconds)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Atención iniciada a las {formatClockLabel(startedAt)}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setTimerVisible(true)}
                  className="flex items-center justify-between rounded-xl border border-dashed border-border bg-background px-4 py-2.5 text-left transition-colors hover:bg-foreground/5"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                    <ClockIcon className="size-3.5 text-muted-foreground" />
                    Tiempo de atención
                  </span>
                  <span className="text-xs font-medium text-primary">Mostrar tiempo</span>
                </button>
              )}

              <div className="rounded-xl border border-border bg-background p-4">
                <h3 className="text-sm font-semibold">Alertas</h3>
                {hasAlerts ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {appointment.notes && (
                      <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                        <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                        <span>{appointment.notes}</span>
                      </div>
                    )}
                    {nextAppointmentDue && (
                      <div className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs text-warning">
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
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                    Sin alertas registradas.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <h3 className="text-sm font-semibold">Últimas atenciones</h3>
                {history.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                    Este paciente aún no tiene historial de citas.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {history.slice(0, 3).map((item) => (
                      <li key={item.id} className="rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">
                            {weekDays.find((d) => d.key === item.day)?.dateLabel ?? item.day}
                          </span>
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[item.status]}`}
                          >
                            {STATUS_LABELS[item.status]}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.type ?? "Sin definir"}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => setInfoMessage("El historial completo estará disponible próximamente.")}
                  className="mt-3 w-full rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
                >
                  Ver historia completa
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-background p-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl justify-end gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/5 disabled:opacity-60 sm:px-6"
          >
            {savingDraft ? "Guardando…" : "Guardar borrador"}
          </button>
          <button
            type="button"
            onClick={() => setShowFinalizeConfirm(true)}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:px-6"
          >
            Finalizar atención
          </button>
        </div>
      </footer>

      {showFinalizeConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !finalizing && setShowFinalizeConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Finalizar atención"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-background p-6 text-center shadow-xl"
          >
            <CheckCircleIcon className="mx-auto size-8 text-primary" />
            <p className="mt-3 text-sm font-medium">¿Finalizar esta atención?</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Quedará registrada en la historia clínica de {appointment.patientName} y la cita se marcará como
              Completada.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowFinalizeConfirm(false)}
                disabled={finalizing}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={finalizing}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {finalizing ? "Finalizando…" : "Finalizar atención"}
              </button>
            </div>
          </div>
        </div>
      )}

      {odontogramOpen && (
        <OdontogramModal
          patientName={appointment.patientName}
          odontogram={odontogram}
          onChange={setOdontogram}
          onClose={() => setOdontogramOpen(false)}
        />
      )}

      {showNewAppointmentModal && (
        <NewAppointmentModal
          dentists={dentists}
          weekDays={weekDays}
          existingAppointments={allAppointments}
          prefill={{
            dentistId: appointment.dentistId,
            patientName: appointment.patientName,
            type: nextTreatment || undefined,
          }}
          onClose={() => setShowNewAppointmentModal(false)}
          onCreate={(created) => {
            onCreateAppointment(created);
            setScheduledNextAppointment(created);
            setShowNewAppointmentModal(false);
          }}
        />
      )}

      {viewingScheduledAppointment && scheduledNextAppointment && (
        <AppointmentDetailModal
          appointment={scheduledNextAppointment}
          allAppointments={allAppointments}
          dentists={dentists}
          weekDays={weekDays}
          onClose={() => setViewingScheduledAppointment(false)}
          onUpdate={(updated) => {
            onUpdateAppointment(updated);
            setScheduledNextAppointment(updated);
          }}
          onStartEncounter={() => setViewingScheduledAppointment(false)}
        />
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof ClipboardIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-background p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
