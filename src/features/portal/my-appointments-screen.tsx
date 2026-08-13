"use client";

import { useRef, useState } from "react";
import { CheckCircleIcon, ChevronIcon, CloseIcon, PhoneIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { AnchoredPopover, FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { buildWeekDaysForOffset, buildWeekLabelForOffset, DENTIST_PROFILE_MOCK } from "@/features/dashboard/appointments-card";
import {
  chronologicalKey,
  CURRENT_WEEK_LABEL,
  DENTISTS,
  HISTORY_STATUS_BADGE_CLASS,
  STATUS_LABELS,
  STATUS_STYLES,
  WEEK_APPOINTMENTS,
  WEEK_DAYS,
  type Appointment,
  type AppointmentStatus,
  type Dentist,
  type WeekDay,
} from "@/features/dashboard/mock-data";
import { DEFAULT_APPOINTMENT_DURATION, TIME_SLOTS } from "@/features/dashboard/schedule-config";
import { getPatientVisitSummary } from "@/features/patients/mock-data";
import { CURRENT_PATIENT } from "@/lib/current-user";
import { MY_CLINIC, MY_PATIENT_RECORD } from "./mock-data";

const UPCOMING_STATUSES: AppointmentStatus[] = ["confirmed", "pending", "in-progress"];
const RESOLVED_STATUSES: AppointmentStatus[] = ["completed", "no-show", "cancelled"];
const HERO_HISTORY_LIMIT = 10;
const CANCEL_REASON_OPTIONS = ["No puedo asistir", "Necesito reprogramar", "Problema personal", "Otro"];
const MAX_RESCHEDULE_WEEKS_AHEAD = 8;

function occupiedTimesFor(dentistId: string, dayKey: string, excludeAppointmentId: string): Set<string> {
  return new Set(
    WEEK_APPOINTMENTS.filter(
      (a) =>
        a.dentistId === dentistId && a.day === dayKey && a.id !== excludeAppointmentId && a.status !== "cancelled",
    ).map((a) => a.time),
  );
}

// Scans forward week by week (capped) for the first day/time with at least
// one open slot for this dentist. Only weekOffset 0 has real modeled
// bookings (see buildWeekDaysForOffset's own comment in
// appointments-card.tsx), so any later week is trivially fully open and the
// scan always terminates.
function findNextAvailableSlot(
  dentistId: string,
  excludeAppointmentId: string,
): { weekOffset: number; day: string; time: string } | null {
  for (let offset = 0; offset <= MAX_RESCHEDULE_WEEKS_AHEAD; offset++) {
    const days = buildWeekDaysForOffset(offset, WEEK_DAYS);
    for (const day of days) {
      const occupied = occupiedTimesFor(dentistId, day.key, excludeAppointmentId);
      const openSlot = TIME_SLOTS.find((slot) => !occupied.has(slot));
      if (openSlot) {
        return { weekOffset: offset, day: day.key, time: openSlot };
      }
    }
  }
  return null;
}

// "Lun 3 Ago · 8:00 AM" — used both by the odontólogo dropdown's closed
// trigger and its option list, for the currently-selected dentist and every
// candidate alike.
function formatNextAvailability(dentistId: string, excludeAppointmentId: string): string {
  const slot = findNextAvailableSlot(dentistId, excludeAppointmentId);
  if (!slot) return "Sin disponibilidad";
  const day = buildWeekDaysForOffset(slot.weekOffset, WEEK_DAYS).find((d) => d.key === slot.day);
  if (!day) return "Sin disponibilidad";
  return `${day.shortLabel} ${day.dateLabel} · ${slot.time}`;
}

// An appointment's day key alone doesn't say which week it belongs to
// (pendingReschedule, or one booked into a future week via
// NewAppointmentScheduler) — this resolves it back to its real WeekDay by
// checking the modeled week first, then scanning forward the same way
// findNextAvailableSlot does. That's also how `isToday` (used to gate
// "Confirmar asistencia" — see CLAUDE.md's Appointment Lifecycle) gets
// resolved correctly regardless of which week the appointment is in.
function resolveDay(dayKey: string): WeekDay | null {
  for (let offset = 0; offset <= MAX_RESCHEDULE_WEEKS_AHEAD; offset++) {
    const match = buildWeekDaysForOffset(offset, WEEK_DAYS).find((d) => d.key === dayKey);
    if (match) return match;
  }
  return null;
}

function resolveDayLabel(dayKey: string): string {
  const day = resolveDay(dayKey);
  return day ? `${day.label}, ${day.dateLabel}` : dayKey;
}

function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

// Mis citas — the Patient's own appointments hub (replaces the old
// standalone Inicio module): the "Próxima cita" protagonist block, plus
// any other upcoming appointments, all on this one screen (no separate
// intermediate dashboard). Local-only simulated CRUD (confirmar/cancelar),
// same "no backend yet" pattern the rest of the app already uses — see
// PROJECT_STATUS.md.
export function MyAppointmentsScreen() {
  const [appointments, setAppointments] = useState<Appointment[]>(() =>
    WEEK_APPOINTMENTS.filter((a) => a.patientName === CURRENT_PATIENT.name),
  );
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<Appointment | null>(null);

  const { nextAppointment } = getPatientVisitSummary(MY_PATIENT_RECORD, appointments, WEEK_DAYS);

  const dentist = nextAppointment ? DENTISTS.find((d) => d.id === nextAppointment.dentistId) : null;
  const dentistProfile = dentist ? DENTIST_PROFILE_MOCK[dentist.id] : undefined;
  const dentistName = dentist?.name ?? "Sin asignar";
  const nextAppointmentDay = nextAppointment ? resolveDay(nextAppointment.day) : null;
  // "Fecha completa" — day name + calendar date, not just one or the other.
  const fullDateLabel = nextAppointment
    ? (nextAppointmentDay ? `${nextAppointmentDay.label}, ${nextAppointmentDay.dateLabel}` : nextAppointment.day)
    : null;
  const durationLabel = nextAppointment
    ? `${nextAppointment.durationMinutes ?? DEFAULT_APPOINTMENT_DURATION} min`
    : null;

  // Same resolved-only set backs both the hero's short preview and the
  // full-history modal — one source, no duplicated "historial" card on the
  // page itself (see HistoryModal below).
  const fullHistory = appointments
    .filter((a) => RESOLVED_STATUSES.includes(a.status))
    .sort((a, b) => chronologicalKey(b, WEEK_DAYS) - chronologicalKey(a, WEEK_DAYS));
  const heroHistory = fullHistory.slice(0, HERO_HISTORY_LIMIT);

  // Everything upcoming besides the one already featured above.
  const otherUpcoming = appointments
    .filter((a) => UPCOMING_STATUSES.includes(a.status) && a.id !== nextAppointment?.id)
    .sort((a, b) => chronologicalKey(a, WEEK_DAYS) - chronologicalKey(b, WEEK_DAYS));

  const updateNextAppointment = (patch: Partial<Appointment>) => {
    if (!nextAppointment) return;
    setAppointments((prev) => prev.map((a) => (a.id === nextAppointment.id ? { ...a, ...patch } : a)));
  };

  // Empty-state booking: the patient has no upcoming appointment yet, so
  // this creates a real one directly (status "pending", same as any other
  // freshly-booked slot) — unlike Reprogramar, there's no existing
  // appointment to keep valid in the meantime, so no "pending request"
  // indirection is needed here.
  const handleCreateAppointment = (day: string, time: string, dentistId: string) => {
    const newAppointment: Appointment = {
      id: `apt-${Date.now()}`,
      day,
      time,
      patientName: CURRENT_PATIENT.name,
      initials: CURRENT_PATIENT.initials,
      status: "pending",
      dentistId,
    };
    setAppointments((prev) => [...prev, newAppointment]);
  };

  // Patient confirming their OWN attendance — deliberately separate from
  // `status` (see CLAUDE.md's Appointment Lifecycle: "Confirmada" there
  // means attendance, not the clinic scheduling/accepting the appointment).
  const handleConfirmAttendance = () => updateNextAppointment({ attendanceConfirmed: true });
  const handleCancelConfirmed = (reason: string) => {
    updateNextAppointment({ status: "cancelled", cancellationReason: reason });
    setShowCancelModal(false);
  };
  // Does NOT touch day/time/dentistId/status — the appointment stays fully
  // vigente. Only records the proposed new slot/professional so the UI can
  // show a pending-request state and block a second request; the clinic
  // approving it isn't built yet (no backend).
  const handleRescheduleConfirmed = (day: string, time: string, dentistId: string) => {
    if (!nextAppointment) return;
    updateNextAppointment({ pendingReschedule: { day, time, dentistId } });
  };

  // A historial row opens the detail modal only when there's something to
  // trace (a cancellation motivo) — every other row stays static, as before.
  const historyRowOnSelect = (item: Appointment) =>
    item.cancellationReason ? () => setSelectedHistoryItem(item) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* Próxima cita — the screen's centerpiece, not a thin info strip:
          Profesional (same visual language as "Perfil del profesional"),
          Datos de la cita, and Historial side by side on wide screens.
          Mobile keeps its already-approved full width; desktop caps and
          centers the card itself (not just its inner content) so it stops
          stretching across the whole page — same treatment for both the
          populated and empty-state (scheduling) content, since it's the
          same card either way. */}
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6 md:mx-auto md:max-w-4xl">
        <h2 className="text-base font-semibold">
          {nextAppointment ? "Próxima cita" : "Agenda tu próxima cita con nosotros"}
        </h2>

        {nextAppointment ? (
          <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,240px)_1fr_minmax(0,260px)]">
            {/* Profesional — same credential-card language as
                DentistProfileModal's left column (appointments-card.tsx),
                read-only: no edit affordances for a Patient. Mobile gets a
                compact 2-column composition (avatar+identity | registro+CTA,
                vertically centered against each other, no divider) instead
                of the taller stacked/centered one, which is kept unchanged
                from md: up. */}
            <div className="rounded-xl border border-border bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] p-4 shadow-sm">
              {/* Mobile-only compact row. */}
              <div className="flex items-center justify-between gap-3 md:hidden">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <UserAvatar
                    name={dentistName}
                    initials={dentist?.initials ?? "?"}
                    avatar_url={dentist?.avatar_url}
                    sizeClassName="size-14"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{dentistName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dentist?.specialty ?? "Odontología general"}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-start gap-1.5">
                  <div>
                    <dt className="text-[10px] text-label-foreground">Registro profesional</dt>
                    <dd className="text-xs font-medium">{dentistProfile?.registrationNumber ?? "Sin registrar"}</dd>
                  </div>
                  {/* The clinic's WhatsApp, not the dentist's own — a
                      Patient never sees a professional's private
                      phone/email here. */}
                  <a
                    href={waLink(MY_CLINIC.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-background px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                  >
                    <PhoneIcon className="size-3" />
                    Contactar clínica
                  </a>
                </div>
              </div>

              {/* Desktop — original stacked/centered composition, unchanged. */}
              <div className="hidden md:block">
                <div className="flex flex-col items-center gap-1 text-center">
                  <UserAvatar
                    name={dentistName}
                    initials={dentist?.initials ?? "?"}
                    avatar_url={dentist?.avatar_url}
                    sizeClassName="size-20"
                  />
                  <p className="mt-2 text-base font-semibold">{dentistName}</p>
                  <p className="text-sm text-muted-foreground">{dentist?.specialty ?? "Odontología general"}</p>
                </div>

                <div className="mt-5 border-t border-border" />

                <dl className="mt-5 flex flex-col gap-4 text-sm">
                  <div>
                    <dt className="text-label-foreground">Registro profesional</dt>
                    <dd className="mt-0.5 font-medium">{dentistProfile?.registrationNumber ?? "Sin registrar"}</dd>
                  </div>
                </dl>

                <a
                  href={waLink(MY_CLINIC.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-background px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                >
                  <PhoneIcon className="size-3" />
                  Contactar clínica
                </a>
              </div>
            </div>

            {/* Datos de la cita */}
            <div className="flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold text-foreground">{fullDateLabel}</p>
                    <p className="mt-0.5 text-sm text-foreground/80">
                      {nextAppointment.time} · {durationLabel}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[nextAppointment.status]}`}
                  >
                    {STATUS_LABELS[nextAppointment.status]}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-label-foreground">Tratamiento</dt>
                    <dd className="font-medium">{nextAppointment.type ?? "Consulta"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-label-foreground">Clínica</dt>
                    <dd className="font-medium">{CURRENT_PATIENT.clinicName}</dd>
                  </div>
                  {nextAppointment.room && (
                    <div>
                      <dt className="text-xs text-label-foreground">Consultorio</dt>
                      <dd className="font-medium">{nextAppointment.room}</dd>
                    </div>
                  )}
                </dl>

                {nextAppointment.pendingReschedule && (
                  <p className="mt-3 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
                    Solicitud de reprogramación pendiente — {resolveDayLabel(nextAppointment.pendingReschedule.day)},{" "}
                    {nextAppointment.pendingReschedule.time} con{" "}
                    {DENTISTS.find((d) => d.id === nextAppointment.pendingReschedule?.dentistId)?.name ?? dentistName}.
                    Tu cita actual sigue vigente hasta que la clínica apruebe el cambio.
                  </p>
                )}
              </div>

              {/* Reglas sin cambios: solo Pendiente/Confirmada admiten
                  acción — En curso/Completada/Cancelada/No asistió nunca
                  son cancelables ni reprogramables. */}
              {(nextAppointment.status === "pending" || nextAppointment.status === "confirmed") && (
                <div className="flex flex-col gap-2">
                  {/* "Confirmar asistencia" — nunca mientras la solicitud
                      sigue Pendiente (la clínica aún no la aceptó), y solo
                      dentro de las 24h previas a una cita ya Confirmada por
                      la clínica (aproximado aquí como "es hoy", ya que este
                      mock no tiene un reloj real). Desaparece una vez que
                      el paciente ya confirmó — ver CLAUDE.md Appointment
                      Lifecycle. */}
                  {nextAppointment.status === "confirmed" &&
                    !nextAppointment.attendanceConfirmed &&
                    nextAppointmentDay?.isToday && (
                      <button
                        type="button"
                        onClick={handleConfirmAttendance}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        Confirmar asistencia
                      </button>
                    )}
                  {/* Reprogramar (secundaria/outline) y Cancelar (destructiva
                      discreta) comparten fila y ancho — grid-cols-2 en vez de
                      flex-1 para que nunca se apilen ni desborden en mobile. */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRescheduleModal(true)}
                      disabled={Boolean(nextAppointment.pendingReschedule)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {nextAppointment.pendingReschedule ? "Solicitud pendiente" : "Reprogramar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(true)}
                      className="rounded-lg border border-danger/20 bg-background px-3 py-2 text-sm font-medium text-danger/80 hover:bg-danger/5 hover:text-danger"
                    >
                      Cancelar cita
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Historial — same "Historial de citas" timeline language
                Odentia already uses elsewhere (left border + dot markers),
                but with every field always visible — no tooltip/hover.
                Past appointments only ever resolve to Completada/No
                asistió/Cancelada in the underlying mock data. The only
                historial on this screen — "Ver historial completo" opens
                the full list in a modal instead of a second card. */}
            <div>
              <h3 className="text-sm font-semibold">Historial de citas</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Últimas atenciones</p>

              {heroHistory.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  Aún no tienes citas pasadas.
                </p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2 border-l border-border/70 pl-4">
                  {heroHistory.map((item) => (
                    <HistoryRow
                      key={item.id}
                      item={item}
                      dentistName={DENTISTS.find((d) => d.id === item.dentistId)?.name ?? "Sin asignar"}
                      dayLabel={WEEK_DAYS.find((d) => d.key === item.day)?.dateLabel ?? item.day}
                      onSelect={historyRowOnSelect(item)}
                    />
                  ))}
                </ol>
              )}

              <button
                type="button"
                onClick={() => setShowFullHistory(true)}
                className="mt-3 w-full rounded-lg border border-border px-3 py-1.5 text-center text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
              >
                Ver historial completo
              </button>
            </div>
          </div>
        ) : (
          // No upcoming appointment — go straight into booking one instead
          // of a dead-end empty state, reusing the exact same
          // odontólogo/week/day/slot picker Reprogramar uses (see
          // useAppointmentSlotPicker/AppointmentSlotFields below).
          <NewAppointmentScheduler onCreate={handleCreateAppointment} />
        )}
      </div>

      {otherUpcoming.length > 0 && (
        <AppointmentSection title="Otras citas próximas" items={otherUpcoming} emptyLabel="" />
      )}

      {/* Secondary once Próxima cita already has the spotlight — doesn't
          compete with it visually. */}
      {nextAppointment && (
        <div className="flex justify-center">
          <button
            type="button"
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5"
          >
            Agendar nueva cita
          </button>
        </div>
      )}

      {showFullHistory && (
        <HistoryModal
          history={fullHistory}
          onClose={() => setShowFullHistory(false)}
          onSelectItem={historyRowOnSelect}
        />
      )}

      {showCancelModal && nextAppointment && (
        <CancelAppointmentModal
          appointment={nextAppointment}
          dentistName={dentistName}
          fullDateLabel={fullDateLabel ?? nextAppointment.day}
          clinicName={CURRENT_PATIENT.clinicName}
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancelConfirmed}
        />
      )}

      {showRescheduleModal && nextAppointment && (
        <RescheduleModal
          appointment={nextAppointment}
          dentistName={dentistName}
          currentFullDateLabel={fullDateLabel ?? nextAppointment.day}
          onClose={() => setShowRescheduleModal(false)}
          onConfirm={handleRescheduleConfirmed}
        />
      )}

      {selectedHistoryItem && (
        <AppointmentReasonModal
          item={selectedHistoryItem}
          dentistName={DENTISTS.find((d) => d.id === selectedHistoryItem.dentistId)?.name ?? "Sin asignar"}
          dayLabel={WEEK_DAYS.find((d) => d.key === selectedHistoryItem.day)?.dateLabel ?? selectedHistoryItem.day}
          onClose={() => setSelectedHistoryItem(null)}
        />
      )}
    </div>
  );
}

// Exported so Mi Historia Clínica (see medical-record.tsx) reuses the same
// row pattern for "Atenciones" instead of a second implementation.
export function AppointmentSection({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Appointment[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((appt) => {
            const dentist = DENTISTS.find((d) => d.id === appt.dentistId);
            const dayLabel = WEEK_DAYS.find((d) => d.key === appt.day)?.label ?? appt.day;
            return (
              <li
                key={appt.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {dayLabel}, {appt.time} · {appt.type ?? "Consulta"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{dentist?.name ?? "Sin asignar"}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appt.status]}`}
                >
                  {STATUS_LABELS[appt.status]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Same modal chrome used everywhere else in the app (header + close, rounded
// sheet on mobile / centered card on desktop) and the same "Historial de
// citas" timeline (HistoryRow) as the hero above — just uncapped.
function HistoryModal({
  history,
  onClose,
  onSelectItem,
}: {
  history: Appointment[];
  onClose: () => void;
  onSelectItem: (item: Appointment) => (() => void) | undefined;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Historial de citas"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[80vh] sm:w-full sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Historial de citas</p>
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
          {history.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Aún no tienes citas pasadas.</p>
          ) : (
            <ol className="flex flex-col gap-2 border-l border-border/70 pl-4">
              {history.map((item) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  dentistName={DENTISTS.find((d) => d.id === item.dentistId)?.name ?? "Sin asignar"}
                  dayLabel={WEEK_DAYS.find((d) => d.key === item.day)?.dateLabel ?? item.day}
                  onSelect={onSelectItem(item)}
                />
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// Timeline row for "Historial de citas" — everything visible directly, no
// tap/hover tooltip: fecha/hora + badge on top, tratamiento and odontólogo
// each on their own line below. Shared by the hero preview and the "Ver
// historial completo" modal so both use the exact same format. Clickable
// only when onSelect is given (cancelled visits with a recorded reason —
// see AppointmentReasonModal), otherwise a static row like before.
function HistoryRow({
  item,
  dentistName,
  dayLabel,
  onSelect,
}: {
  item: Appointment;
  dentistName: string;
  dayLabel: string;
  onSelect?: () => void;
}) {
  const rowContent = (
    <>
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
      <p className="mt-0.5 text-xs font-medium text-foreground">{item.type ?? "Consulta"}</p>
      <p className="mt-0.5 text-[10px] text-label-foreground">{dentistName}</p>
    </>
  );

  return (
    <li className="relative">
      <span
        className="absolute -left-[19px] top-1.5 size-1.5 rounded-full bg-muted-foreground/40 ring-4 ring-surface"
        aria-hidden="true"
      />
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="w-full rounded-lg px-2 py-1 text-left leading-tight transition-colors hover:bg-foreground/5"
        >
          {rowContent}
        </button>
      ) : (
        <div className="px-2 py-1 leading-tight">{rowContent}</div>
      )}
    </li>
  );
}

// Wide, unmistakable confirmation modal — replaces the old inline "¿Cancelar
// esta cita?" strip, which felt too small for a destructive action.
function CancelAppointmentModal({
  appointment,
  dentistName,
  fullDateLabel,
  clinicName,
  onClose,
  onConfirm,
}: {
  appointment: Appointment;
  dentistName: string;
  fullDateLabel: string;
  clinicName: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reasonOption, setReasonOption] = useState("");
  const [customReason, setCustomReason] = useState("");

  const isOther = reasonOption === "Otro";
  const canConfirm = isOther ? customReason.trim().length > 0 : reasonOption.length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(isOther ? customReason.trim() : reasonOption);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cancelar cita"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Cancelar cita</p>
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
          <p className="text-sm text-foreground/80">¿Estás seguro de que deseas cancelar esta cita?</p>

          <dl className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Fecha y hora</dt>
              <dd className="font-medium">
                {fullDateLabel}, {appointment.time}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Tratamiento</dt>
              <dd className="font-medium">{appointment.type ?? "Consulta"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Odontólogo</dt>
              <dd className="font-medium">{dentistName}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Clínica</dt>
              <dd className="font-medium">{clinicName}</dd>
            </div>
          </dl>

          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Motivo de cancelación</span>
            <select
              value={reasonOption}
              onChange={(e) => setReasonOption(e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">Selecciona un motivo</option>
              {CANCEL_REASON_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          {isOther && (
            <textarea
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Cuéntanos brevemente el motivo"
              rows={3}
              className={`${FIELD_CLASS} mt-2 resize-none`}
            />
          )}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-foreground/5"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-danger px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar cita
          </button>
        </div>
      </div>
    </div>
  );
}

// Read-only detail for a historial entry — reachable for a cancelled visit
// (its motivo) or a reprogramada one (its previous slot), without a
// tooltip (see HistoryRow).
function AppointmentReasonModal({
  item,
  dentistName,
  dayLabel,
  onClose,
}: {
  item: Appointment;
  dentistName: string;
  dayLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de la cita"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[80vh] sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Detalle de la cita</p>
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              {dayLabel}, {item.time}
            </p>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${HISTORY_STATUS_BADGE_CLASS[item.status]}`}
            >
              {STATUS_LABELS[item.status]}
            </span>
          </div>

          <dl className="mt-4 flex flex-col gap-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-label-foreground">Tratamiento</dt>
              <dd className="font-medium">{item.type ?? "Consulta"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-label-foreground">Odontólogo</dt>
              <dd className="font-medium">{dentistName}</dd>
            </div>
          </dl>

          {item.cancellationReason && (
            <div className="mt-4 rounded-lg border border-border bg-surface p-3">
              <p className="text-xs font-semibold text-label-foreground uppercase">Motivo de cancelación</p>
              <p className="mt-1 text-sm text-foreground">{item.cancellationReason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Reuses Agenda's own week-nav/day-selector date math (buildWeekDaysForOffset/
// buildWeekLabelForOffset, appointments-card.tsx) instead of a second
// implementation. Opens pre-selected on the given dentist's next open day
// (see findNextAvailableSlot above) — no dead "pick a day first" state.
// Occupied-slot lookups only find real bookings for weekOffset 0 (the one
// modeled week); later weeks are trivially open since no data exists there,
// which is exactly how the auto-search finds a next available day when the
// current week is fully booked.
//
// Shared by RescheduleModal (Reprogramar) and NewAppointmentScheduler (the
// empty-state booking flow) so both use the exact same
// odontólogo/week/day/slot picker instead of two implementations —
// `excludeAppointmentId` is the appointment being moved for the former, and
// an id that can never match a real appointment for the latter (there's
// nothing to exclude yet).
function useAppointmentSlotPicker(initialDentistId: string, excludeAppointmentId: string) {
  const initialSlot = findNextAvailableSlot(initialDentistId, excludeAppointmentId);

  const [selectedDentistId, setSelectedDentistId] = useState(initialDentistId);
  const [weekOffset, setWeekOffset] = useState(initialSlot?.weekOffset ?? 0);
  const [selectedDay, setSelectedDay] = useState<string | null>(initialSlot?.day ?? null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [dentistDropdownOpen, setDentistDropdownOpen] = useState(false);
  const dentistTriggerRef = useRef<HTMLButtonElement>(null);

  const selectedDentist = DENTISTS.find((d) => d.id === selectedDentistId);
  const currentWeekDays = buildWeekDaysForOffset(weekOffset, WEEK_DAYS);
  const currentWeekLabel = buildWeekLabelForOffset(weekOffset, CURRENT_WEEK_LABEL);
  const selectedDayInfo = selectedDay ? currentWeekDays.find((d) => d.key === selectedDay) : null;

  const occupiedTimes = selectedDay
    ? occupiedTimesFor(selectedDentistId, selectedDay, excludeAppointmentId)
    : new Set<string>();
  const hasAvailableSlots = TIME_SLOTS.some((slot) => !occupiedTimes.has(slot));
  const canSubmit = Boolean(selectedDay && selectedTime);

  const changeWeek = (nextOffset: number) => {
    setWeekOffset(nextOffset);
    setSelectedDay(null);
    setSelectedTime(null);
  };

  const handlePickDay = (day: string) => {
    setSelectedDay(day);
    setSelectedTime(null);
  };

  const handlePickDentist = (dentistId: string) => {
    setSelectedDentistId(dentistId);
    const next = findNextAvailableSlot(dentistId, excludeAppointmentId);
    setWeekOffset(next?.weekOffset ?? 0);
    setSelectedDay(next?.day ?? null);
    setSelectedTime(null);
    setDentistDropdownOpen(false);
  };

  return {
    selectedDentistId,
    selectedDentist,
    weekOffset,
    selectedDay,
    selectedDayInfo,
    selectedTime,
    setSelectedTime,
    dentistDropdownOpen,
    setDentistDropdownOpen,
    dentistTriggerRef,
    currentWeekDays,
    currentWeekLabel,
    occupiedTimes,
    hasAvailableSlots,
    canSubmit,
    changeWeek,
    handlePickDay,
    handlePickDentist,
  };
}

// Odontólogo dropdown + week nav + day selector + slot grid + selected
// summary — the exact same picker UI for both Reprogramar and the
// empty-state "new appointment" flow (see useAppointmentSlotPicker above).
// Only the surrounding chrome (title, current-appointment summary, CTA
// label/behavior) differs per caller.
function AppointmentSlotFields({
  excludeAppointmentId,
  picker,
  // The "Nueva fecha y hora" recap belongs conceptually to Reprogramar
  // (it's re-stating a CHANGE from the current appointment) — the new-
  // appointment flow has no "current" slot to contrast against, so it
  // opts out and relies on the slot grid's own selected styling instead
  // (see NewAppointmentScheduler below). Defaults to true so Reprogramar
  // is unaffected.
  showSelectionSummary = true,
}: {
  excludeAppointmentId: string;
  picker: ReturnType<typeof useAppointmentSlotPicker>;
  showSelectionSummary?: boolean;
}) {
  const {
    selectedDentistId,
    selectedDentist,
    weekOffset,
    selectedDay,
    selectedDayInfo,
    selectedTime,
    setSelectedTime,
    dentistDropdownOpen,
    setDentistDropdownOpen,
    dentistTriggerRef,
    currentWeekDays,
    currentWeekLabel,
    occupiedTimes,
    hasAvailableSlots,
    changeWeek,
    handlePickDay,
    handlePickDentist,
  } = picker;

  return (
    <>
      {/* Odontólogo — dropdown enriquecido, parte del odontólogo inicial
          por defecto. Se despliega como overlay anclado (mismo patrón que
          los editores de Fecha/Horario, appointment-detail-modal.tsx) sin
          ocultar el resto del flujo. */}
      <div className="relative mt-4">
        <p className="text-sm font-medium text-foreground">Odontólogo</p>
        <button
          ref={dentistTriggerRef}
          type="button"
          onClick={() => setDentistDropdownOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={dentistDropdownOpen}
          className="mt-2 flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
        >
          <UserAvatar
            name={selectedDentist?.name ?? "Sin asignar"}
            initials={selectedDentist?.initials ?? "?"}
            avatar_url={selectedDentist?.avatar_url}
            sizeClassName="size-10"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{selectedDentist?.name ?? "Sin asignar"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {selectedDentist?.specialty ?? "Odontología general"}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-primary">
              Próx. disponibilidad: {formatNextAvailability(selectedDentistId, excludeAppointmentId)}
            </p>
          </div>
          <ChevronIcon
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${
              dentistDropdownOpen ? "rotate-90" : "-rotate-90"
            }`}
          />
        </button>

        <AnchoredPopover
          open={dentistDropdownOpen}
          anchorRef={dentistTriggerRef}
          onClose={() => setDentistDropdownOpen(false)}
          widthClass="w-72"
        >
          <div role="listbox" className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {DENTISTS.map((d) => {
              const active = d.id === selectedDentistId;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => handlePickDentist(d.id)}
                  className={`flex items-center gap-2.5 rounded-lg p-2 text-left transition-colors ${
                    active ? "bg-primary/10" : "hover:bg-foreground/5"
                  }`}
                >
                  <UserAvatar name={d.name} initials={d.initials} avatar_url={d.avatar_url} sizeClassName="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.specialty}</p>
                    <p className="mt-0.5 truncate text-[11px] text-primary">
                      Próx. disponibilidad: {formatNextAvailability(d.id, excludeAppointmentId)}
                    </p>
                  </div>
                  {active && <CheckCircleIcon className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </AnchoredPopover>
      </div>

      {/* Navegación semanal + selector de días horizontal, mismo patrón
          visual/de datos que la Agenda. */}
      <div className="mt-4 flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => changeWeek(weekOffset - 1)}
          aria-label="Semana anterior"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
        >
          <ChevronIcon className="size-4" />
        </button>
        <span className="min-w-0 px-1 text-center text-sm font-semibold tracking-tight">{currentWeekLabel}</span>
        <button
          type="button"
          onClick={() => changeWeek(weekOffset + 1)}
          aria-label="Semana siguiente"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
        >
          <ChevronIcon className="size-4 rotate-180" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {currentWeekDays.map((day) => {
          const active = day.key === selectedDay;
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => handlePickDay(day.key)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-colors ${
                active ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/[0.03]"
              }`}
            >
              <span
                className={`text-[10px] font-medium tracking-wide uppercase ${
                  active ? "text-primary" : "text-label-foreground"
                }`}
              >
                {day.shortLabel}
              </span>
              <span className={`text-sm font-semibold ${active ? "text-primary" : ""}`}>{day.dateNumber}</span>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">Horarios disponibles — {selectedDayInfo?.label}</p>
          {hasAvailableSlots ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {TIME_SLOTS.map((slot) => {
                const taken = occupiedTimes.has(slot);
                const active = selectedTime === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={taken}
                    onClick={() => setSelectedTime(slot)}
                    className={`rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors ${
                      taken
                        ? "cursor-not-allowed border-border/60 text-muted-foreground/40 opacity-40"
                        : active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-foreground/80 hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No hay horarios disponibles este día.</p>
          )}
        </div>
      )}

      {showSelectionSummary && selectedDay && selectedTime && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-semibold text-primary uppercase">Nueva fecha y hora</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {selectedDayInfo?.label}, {selectedDayInfo?.dateLabel} · {selectedTime}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{selectedDentist?.name ?? "Sin asignar"}</p>
        </div>
      )}
    </>
  );
}

// Empty-state booking — replaces the old dead-end "No tienes citas próximas
// programadas." message with the same picker Reprogramar uses (see
// AppointmentSlotFields above), just with new-appointment copy/CTA and no
// "cita actual" summary (there isn't one yet). Defaults to the clinic's
// first dentist — there's no existing appointment to default from. No
// "Nueva fecha y hora" recap either (see showSelectionSummary above) — the
// selected slot's own highlighted styling is enough here; that block is
// Reprogramar's own "here's the change" framing, not this flow's.
// "Agendar cita" doesn't book immediately — it opens a confirmation modal
// first (see ConfirmNewAppointmentModal); only confirming there actually
// creates the appointment. Creating never goes through a "pending request"
// phase like Reprogramar does: there's no existing valid appointment to
// protect in the meantime, so it's simply added directly (see
// handleCreateAppointment in MyAppointmentsScreen).
function NewAppointmentScheduler({ onCreate }: { onCreate: (day: string, time: string, dentistId: string) => void }) {
  const picker = useAppointmentSlotPicker(DENTISTS[0].id, "");
  const [showConfirm, setShowConfirm] = useState(false);

  const handleConfirm = () => {
    if (!picker.selectedDay || !picker.selectedTime) return;
    onCreate(picker.selectedDay, picker.selectedTime, picker.selectedDentistId);
    setShowConfirm(false);
  };

  return (
    // Mobile keeps its already-approved full-width layout; desktop caps the
    // whole picker (odontólogo, semana, días, horarios, CTA) to one shared,
    // centered width instead of stretching the 3-column slot grid across
    // the entire card — same density as the Reprogramar modal's own
    // max-w-md, just inline instead of in a dialog.
    <div className="md:mx-auto md:max-w-md">
      <AppointmentSlotFields excludeAppointmentId="" picker={picker} showSelectionSummary={false} />

      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={!picker.canSubmit}
        className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Agendar cita
      </button>

      {/* "Volver" just closes this — the picker's own state lives in the
          parent (via the picker hook), so the current selection is kept. */}
      {showConfirm && picker.selectedDentist && picker.selectedDayInfo && picker.selectedTime && (
        <ConfirmNewAppointmentModal
          dentist={picker.selectedDentist}
          dayLabel={`${picker.selectedDayInfo.label}, ${picker.selectedDayInfo.dateLabel}`}
          time={picker.selectedTime}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

// Confirmation step for a brand-new appointment — Reprogramar has no
// equivalent (it books nothing new), so this is scoped to
// NewAppointmentScheduler only.
function ConfirmNewAppointmentModal({
  dentist,
  dayLabel,
  time,
  onClose,
  onConfirm,
}: {
  dentist: Dentist;
  dayLabel: string;
  time: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirma tu cita"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Confirma tu cita</p>
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
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
            <UserAvatar
              name={dentist.name}
              initials={dentist.initials}
              avatar_url={dentist.avatar_url}
              sizeClassName="size-12"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{dentist.name}</p>
              <p className="truncate text-xs text-muted-foreground">{dentist.specialty}</p>
            </div>
          </div>

          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Fecha</dt>
              <dd className="font-medium">{dayLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Hora</dt>
              <dd className="font-medium">{time}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Duración</dt>
              <dd className="font-medium">{DEFAULT_APPOINTMENT_DURATION} min</dd>
            </div>
          </dl>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-foreground/5"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Confirmar cita
          </button>
        </div>
      </div>
    </div>
  );
}

// Submitting never touches the real appointment: it only records a
// `pendingReschedule` slot+dentist (see onConfirm/handleRescheduleConfirmed
// in MyAppointmentsScreen) and this modal moves to a "sent" confirmation
// phase — approval isn't built yet (no backend).
function RescheduleModal({
  appointment,
  dentistName,
  currentFullDateLabel,
  onClose,
  onConfirm,
}: {
  appointment: Appointment;
  dentistName: string;
  currentFullDateLabel: string;
  onClose: () => void;
  onConfirm: (day: string, time: string, dentistId: string) => void;
}) {
  // All 3 of the clinic's dentists are always offered — including whichever
  // one the appointment is currently with, so switching away and back is
  // always possible (see task scope: no specialty-based filtering here).
  const picker = useAppointmentSlotPicker(appointment.dentistId, appointment.id);
  const [sent, setSent] = useState(false);

  const handleSubmit = () => {
    if (!picker.selectedDay || !picker.selectedTime) return;
    onConfirm(picker.selectedDay, picker.selectedTime, picker.selectedDentistId);
    setSent(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reprogramar cita"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Reprogramar cita</p>
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
          {sent ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm font-medium text-foreground">
                Solicitud de reprogramación enviada. Tu cita actual continúa vigente hasta que la clínica apruebe el
                cambio.
              </p>
            </div>
          ) : (
            <>
              {/* Resumen compacto de la cita actual — el odontólogo no
                  cambia, por eso no es editable aquí. */}
              <dl className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-label-foreground">Cita actual</dt>
                  <dd className="font-medium">
                    {currentFullDateLabel}, {appointment.time}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-label-foreground">Tratamiento</dt>
                  <dd className="font-medium">{appointment.type ?? "Consulta"}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-label-foreground">Odontólogo</dt>
                  <dd className="font-medium">{dentistName}</dd>
                </div>
              </dl>

              <AppointmentSlotFields excludeAppointmentId={appointment.id} picker={picker} />
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-5 py-3">
          {sent ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Entendido
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!picker.canSubmit}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Solicitar reprogramación
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
