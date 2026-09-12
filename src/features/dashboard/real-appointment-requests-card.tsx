"use client";

import { useState, type ReactNode } from "react";
import { Combobox } from "@/components/combobox";
import { useToast } from "@/components/toast";
import { UserAvatar } from "@/components/user-avatar";
import { CalendarIcon, ChevronIcon, ClockIcon, CloseIcon, FlagIcon, MapPinIcon, NoteIcon, UserIcon } from "@/components/shell/icons";
import { FIELD_CLASS, PopoverFieldRow, TimePopoverContent } from "./appointment-detail-modal";
import type { Appointment } from "./appointments-data";
import { acceptAppointmentRequest, rejectAppointmentRequest } from "./appointment-requests-actions";
import type { AppointmentRequest } from "./appointment-requests-data";
import { dateKeyOf, formatDateLabel, formatTimeLabel, isPastSlot, slotStartIso, type BoardProfessional } from "./real-format";
import { getWeekDaysContaining } from "./real-week";
import { WeekDayPickerContent } from "./real-week-day-picker";
import { DEFAULT_APPOINTMENT_DURATION, TIME_SLOTS } from "./schedule-config";

// Real clinic-side "Solicitudes de cita" — the Agenda's own work queue for
// the Solicitud lifecycle (Pendiente → Aceptada / Rechazada), deliberately
// its own card in the same right-hand column as the KPIs and Marketplace,
// never a row on the appointments board: a Solicitud is not a Cita and must
// never look like one (CLAUDE.md's Appointment Lifecycle).
//
// Reuses the approved Agenda field vocabulary as-is — the same
// PopoverFieldRow/TimePopoverContent/WeekDayPickerContent/Combobox pieces
// RealNewAppointmentModal already composes for Fecha/Horario/Consultorio/
// Tratamiento/Observaciones — rather than a second, differently-shaped
// scheduling form. Accepting IS creating a Cita, so it looks and behaves
// like creating one.
//
// Which staff see this card at all is decided server-side by RLS
// (appointment_requests_select_staff → can_access_appointment): Clinic
// Admin and Assistant across the whole clinic, a Dentist only for requests
// naming their own professional_profile. Nothing here widens that, and the
// accept/reject RPCs re-check it independently — hiding a card is never
// the authorization boundary.
export function RealAppointmentRequestsCard({
  requests: initialRequests,
  professionals,
  treatmentOptions,
  roomOptions,
  onAppointmentCreated,
}: {
  requests: AppointmentRequest[];
  professionals: BoardProfessional[];
  treatmentOptions: string[];
  roomOptions: string[];
  onAppointmentCreated: (created: Appointment) => void;
}) {
  const [requests, setRequests] = useState<AppointmentRequest[]>(initialRequests);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const selectedRequest = requests.find((r) => r.id === selectedRequestId) ?? null;

  // A resolved request leaves the queue immediately — it is no longer
  // pending, and this card only ever shows the actionable set.
  const removeRequest = (requestId: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    setSelectedRequestId(null);
  };

  return (
    <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Solicitudes de cita</h2>
        {requests.length > 0 && (
          <span className="shrink-0 rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
            {requests.length} pendiente{requests.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">Enviadas por pacientes desde su portal</p>

      {requests.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Sin solicitudes pendientes.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {requests.map((request) => {
            const professional = professionals.find((p) => p.professionalProfileId === request.professionalProfileId);
            return (
              <li key={request.id}>
                <button
                  type="button"
                  onClick={() => setSelectedRequestId(request.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{request.patientName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateLabel(request.preferredStartsAt)} · {formatTimeLabel(request.preferredStartsAt)} ·{" "}
                      {professional?.name ?? "Profesional"}
                    </p>
                  </div>
                  <ChevronIcon className="size-4 shrink-0 -rotate-180 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedRequest && (
        <AppointmentRequestModal
          request={selectedRequest}
          professionals={professionals}
          treatmentOptions={treatmentOptions}
          roomOptions={roomOptions}
          onClose={() => setSelectedRequestId(null)}
          onResolved={removeRequest}
          onAppointmentCreated={onAppointmentCreated}
        />
      )}
    </div>
  );
}

// Resolves the patient's preferred instant back to the (dayKey, slot) pair
// the Agenda's own pickers speak. The Portal only ever offers TIME_SLOTS,
// so this normally matches exactly; anything that doesn't (a preference
// whose slot no longer exists in the clinic's configured hours) falls back
// to "unset" rather than silently snapping to a different time.
function preferredSlot(preferredStartsAt: string): { dayKey: string; time: string } {
  const dayKey = dateKeyOf(preferredStartsAt);
  const time = formatTimeLabel(preferredStartsAt);
  return { dayKey, time: TIME_SLOTS.includes(time) ? time : "" };
}

function addWeeks(dayKey: string, weeks: number): string {
  const [year, month, date] = dayKey.split("-").map(Number);
  const shifted = new Date(year, month - 1, date + weeks * 7);
  return dateKeyOf(shifted.toISOString());
}

function AppointmentRequestModal({
  request,
  professionals,
  treatmentOptions,
  roomOptions,
  onClose,
  onResolved,
  onAppointmentCreated,
}: {
  request: AppointmentRequest;
  professionals: BoardProfessional[];
  treatmentOptions: string[];
  roomOptions: string[];
  onClose: () => void;
  onResolved: (requestId: string) => void;
  onAppointmentCreated: (created: Appointment) => void;
}) {
  const { showToast } = useToast();
  const preferred = preferredSlot(request.preferredStartsAt);
  const preferredProfessional = professionals.find((p) => p.professionalProfileId === request.professionalProfileId) ?? null;
  // Pre-filled with what the patient asked for — but every field stays the
  // clinic's decision, and the request's own preferred_starts_at is never
  // overwritten, so the two remain distinguishable side by side.
  const [professionalId, setProfessionalId] = useState(request.professionalProfileId);
  const [weekAnchorDayKey, setWeekAnchorDayKey] = useState(preferred.dayKey);
  const [dayKey, setDayKey] = useState(preferred.dayKey);
  const [time, setTime] = useState(preferred.time);
  const [durationMinutes, setDurationMinutes] = useState(
    preferredProfessional?.defaultAppointmentDurationMinutes ?? DEFAULT_APPOINTMENT_DURATION,
  );
  const [durationTouched, setDurationTouched] = useState(false);
  const [room, setRoom] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [editingField, setEditingField] = useState<"date" | "time" | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekDays = getWeekDaysContaining(new Date(`${weekAnchorDayKey}T12:00:00`).toISOString());
  const weekLabel = `${weekDays[0].dateLabel} – ${weekDays[6].dateLabel}`;
  const selectedProfessional = professionals.find((p) => p.professionalProfileId === professionalId) ?? null;
  const dayEntry = weekDays.find((d) => d.key === dayKey);
  const dayLabel = dayEntry ? `${dayEntry.label}, ${dayEntry.dateLabel}` : "Selecciona una fecha";
  const timeLabel = time ? `${time} (${durationMinutes} min)` : "Selecciona un horario";

  // Same stale-slot guard RealNewAppointmentModal has: Fecha and Horario
  // are edited independently, so a time chosen for a later day can be past
  // once the day moves earlier. One shared check (real-format.ts's
  // isPastSlot), not a second comparison.
  const staleTime = Boolean(dayKey && time) && isPastSlot(dayKey, time);
  const busy = accepting || rejecting;
  const canAccept = Boolean(professionalId && dayKey && time) && !staleTime && !busy;

  const handleAccept = async () => {
    if (!canAccept) return;
    setAccepting(true);
    setError(null);
    const outcome = await acceptAppointmentRequest({
      requestId: request.id,
      professionalProfileId: professionalId,
      startsAt: slotStartIso(dayKey, time),
      durationMinutes,
      room: room || null,
      reason: reason || null,
      notes: notes || null,
      patientName: request.patientName,
      patientPhone: request.patientPhone,
    });
    setAccepting(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    // Only ever on confirmed backend success — the Cita is real by now, so
    // it goes straight into the board's shared appointment state.
    onAppointmentCreated(outcome.appointment);
    showToast(`Solicitud aceptada — ${request.patientName} · ${dayLabel} · ${time}`);
    onResolved(request.id);
  };

  const handleReject = async () => {
    if (busy) return;
    setRejecting(true);
    setError(null);
    const outcome = await rejectAppointmentRequest(request.id);
    setRejecting(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    showToast(`Solicitud rechazada — ${request.patientName}`);
    onResolved(request.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Solicitud de cita"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Solicitud de cita</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3.5">
          {/* Lo que pidió el paciente — read-only, never conflated with the
              Cita being created below. */}
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="text-[11px] font-semibold tracking-wide text-label-foreground uppercase">
              Solicitud del paciente
            </p>
            <dl className="mt-2 flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs text-label-foreground">Paciente</dt>
                <dd className="font-medium">{request.patientName}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs text-label-foreground">Fecha y hora preferidas</dt>
                <dd className="font-medium">
                  {formatDateLabel(request.preferredStartsAt)}, {formatTimeLabel(request.preferredStartsAt)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs text-label-foreground">Profesional solicitado</dt>
                <dd className="font-medium">{preferredProfessional?.name ?? "Profesional"}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-xs text-label-foreground">Enviada</dt>
                <dd className="font-medium">
                  {formatDateLabel(request.createdAt)}, {formatTimeLabel(request.createdAt)}
                </dd>
              </div>
            </dl>
          </div>

          {/* La cita que se va a crear — same fields, same order, same
              components as Nueva cita. */}
          <p className="mt-4 text-[11px] font-semibold tracking-wide text-label-foreground uppercase">Cita a agendar</p>

          <div className="mt-2 flex flex-col gap-2.5">
            <Field icon={UserIcon} label="Profesional">
                  <Combobox
                    items={professionals}
                    getKey={(professional) => professional.professionalProfileId}
                    getSearchText={(professional) => `${professional.name} ${professional.specialty}`}
                    selectedItem={selectedProfessional}
                    onSelect={(professional) => {
                      setProfessionalId(professional.professionalProfileId);
                      if (!durationTouched) {
                        setDurationMinutes(professional.defaultAppointmentDurationMinutes ?? DEFAULT_APPOINTMENT_DURATION);
                      }
                    }}
                    placeholder="Buscar profesional…"
                    emptyText="Sin resultados"
                    renderItem={(professional) => (
                      <>
                        <UserAvatar
                          name={professional.name}
                          initials={professional.initials}
                          avatar_url={professional.avatarUrl ?? undefined}
                          sizeClassName="size-8"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{professional.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{professional.specialty}</span>
                        </span>
                      </>
                    )}
                  />
            </Field>

            <PopoverFieldRow
              icon={ClockIcon}
              triggerIcon={CalendarIcon}
              label="Fecha"
              value={dayLabel}
              open={editingField === "date"}
              onToggle={() => setEditingField(editingField === "date" ? null : "date")}
              onClose={() => setEditingField(null)}
            >
              {/* WeekDayPickerContent only ever offers one week (see its own
                  comment) — the patient's preferred week is the natural
                  anchor, and these arrows let the clinic move the Cita to a
                  different week without leaving the request. */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => setWeekAnchorDayKey((key) => addWeeks(key, -1))}
                    aria-label="Semana anterior"
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
                  >
                    <ChevronIcon className="size-3.5" />
                  </button>
                  <span className="min-w-0 truncate text-xs font-semibold">{weekLabel}</span>
                  <button
                    type="button"
                    onClick={() => setWeekAnchorDayKey((key) => addWeeks(key, 1))}
                    aria-label="Semana siguiente"
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-foreground/70 hover:bg-foreground/5"
                  >
                    <ChevronIcon className="size-3.5 rotate-180" />
                  </button>
                </div>
                <WeekDayPickerContent
                  weekDays={weekDays}
                  currentDayKey={dayKey}
                  onSelect={(key) => {
                    setDayKey(key);
                    setEditingField(null);
                  }}
                />
              </div>
            </PopoverFieldRow>

            <PopoverFieldRow
              icon={ClockIcon}
              triggerIcon={ClockIcon}
              label="Horario"
              value={timeLabel}
              open={editingField === "time"}
              onToggle={() => setEditingField(editingField === "time" ? null : "time")}
              onClose={() => setEditingField(null)}
            >
              <TimePopoverContent
                time={time || TIME_SLOTS[0]}
                durationMinutes={durationMinutes}
                isSlotDisabled={dayKey ? (slot) => isPastSlot(dayKey, slot) : undefined}
                onSave={async (patch) => {
                  setTime(patch.time);
                  setDurationMinutes(patch.durationMinutes);
                  setDurationTouched(true);
                  setEditingField(null);
                }}
                onCancel={() => setEditingField(null)}
              />
            </PopoverFieldRow>

            <Field icon={MapPinIcon} label="Consultorio">
              <Combobox
                items={roomOptions}
                getKey={(option) => option}
                getSearchText={(option) => option}
                selectedItem={room || null}
                onSelect={(option) => setRoom(option)}
                placeholder="Buscar consultorio…"
                emptyText="Sin resultados"
                renderItem={(option) => (
                  <>
                    <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-sm font-medium">{option}</span>
                  </>
                )}
              />
            </Field>

            <Field icon={FlagIcon} label="Tratamiento propuesto">
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD_CLASS}>
                <option value="">Sin definir</option>
                {treatmentOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field icon={NoteIcon} label="Observaciones">
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${FIELD_CLASS} resize-none`} />
            </Field>

            {staleTime && !error && (
              <p className="text-xs text-danger">El horario elegido ya pasó para esta fecha. Ábrelo de nuevo y elige otro.</p>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border p-4">
          <button
            type="button"
            onClick={handleReject}
            disabled={busy}
            className="rounded-lg border border-danger/20 bg-background px-3 py-2 text-sm font-medium text-danger/80 hover:bg-danger/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rejecting ? "Rechazando…" : "Rechazar"}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={!canAccept}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {accepting ? "Aceptando…" : "Aceptar y agendar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof ClockIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <label className="text-[11px] text-label-foreground">{label}</label>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}
