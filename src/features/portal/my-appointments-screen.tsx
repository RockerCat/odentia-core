"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { CloseIcon, PhoneIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { formatDateLabel, formatTimeLabel } from "@/features/dashboard/real-format";
import { getDisplayStatus, getHistoryStatusBadgeClass, getStatusLabel, getStatusStyle } from "@/features/dashboard/real-status";
import type { PatientContext } from "@/features/session/types";
import { FIELD_CLASS } from "@/features/dashboard/form-primitives";
import { canPatientChangeAppointment, canPatientConfirmAppointment } from "./appointment-eligibility";
import { cancelMyAppointment, confirmMyAppointment } from "./appointments-actions";
import { CANCELLATION_REASONS, isValidCancellationInput } from "./cancellation-reasons";
import { requestMyAppointment, requestMyAppointmentReschedule } from "./requests-actions";
import type { PortalAppointment } from "./appointments-data";
import { appointmentReasonLabel, buildMyAppointmentsView, pendingRescheduleFor, professionalCardFields } from "./my-appointments-view";
import { RequestAppointmentScheduler, type SchedulerSubmitOutcome } from "./request-appointment-scheduler";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_STYLES,
  type PortalAppointmentRequest,
  type PortalProfessional,
} from "./requests-data";

function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

// Mis citas — real data only (see appointments-data.ts's fetchMyAppointments,
// scoped by the real patient/clinic resolved via resolvePatientContext).
// Listing, real statuses (getDisplayStatus, the same "Sin cerrar" derivation
// the real Agenda uses — see CLAUDE.md's Appointment Lifecycle), and
// próximas/historial split (see appointments-split.ts) are read-only. The
// real write paths are:
//   - "Confirmar asistencia" — confirm_my_appointment(), see
//     appointments-actions.ts: a Patient confirming her OWN attendance on
//     her OWN still-"scheduled" Cita.
//   - "Solicitar cita" — request_my_appointment(), see requests-actions.ts:
//     a Solicitud de Cita, a SEPARATE entity from a Cita (CLAUDE.md's
//     Appointment Lifecycle). It creates NO appointment and reserves no
//     slot; only the clinic accepting it does.
//   - "Reprogramar" — request_my_appointment_reschedule(): a reschedule
//     REQUEST for her own Cita; the Cita only moves when the clinic accepts.
//   - "Cancelar cita" — cancel_my_appointment(): cancels her own future
//     scheduled/confirmed Cita with the approved motivo (never deleted).
// Buttons only render when canPatientChangeAppointment() allows it; the
// backend re-checks everything.
export function MyAppointmentsScreen({
  context,
  appointments,
  requests,
  professionals,
  loadError,
}: {
  context: PatientContext;
  appointments: PortalAppointment[];
  requests: PortalAppointmentRequest[];
  professionals: PortalProfessional[];
  loadError: boolean;
}) {
  const { showToast } = useToast();
  const [items, setItems] = useState<PortalAppointment[]>(appointments);
  const [requestItems, setRequestItems] = useState<PortalAppointmentRequest[]>(requests);
  const [selectedAppointment, setSelectedAppointment] = useState<PortalAppointment | null>(null);
  const [showFullHistory, setShowFullHistory] = useState(false);
  // "Agendar nueva cita" swaps the Próxima cita card's content for the real
  // scheduler (request_my_appointment — a Solicitud, never a Cita), with a
  // way back; it never REPLACES Mis citas as the screen's default view.
  const [scheduling, setScheduling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [rescheduling, setRescheduling] = useState<PortalAppointment | null>(null);
  const [cancelling, setCancelling] = useState<PortalAppointment | null>(null);

  const professionalNameOf = (professionalProfileId: string) =>
    professionals.find((p) => p.professionalProfileId === professionalProfileId)?.name ?? "Profesional";

  // A request only ever lands here as "Pendiente" — never as an optimistic
  // Cita: the clinic's decision is what creates/moves a Cita.
  const addPendingRequest = (
    kind: PortalAppointmentRequest["kind"],
    appointmentId: string | null,
    request: { id: string; professionalProfileId: string; preferredStartsAt: string; createdAt: string },
  ) => {
    setRequestItems((prev) => [
      {
        id: request.id,
        kind,
        appointmentId,
        professionalProfileId: request.professionalProfileId,
        professionalName: professionalNameOf(request.professionalProfileId),
        preferredStartsAt: request.preferredStartsAt,
        status: "pending",
        acceptedAppointmentId: null,
        createdAt: request.createdAt,
      },
      ...prev,
    ]);
  };

  const submitNewRequest = async (professionalProfileId: string, preferredStartsAt: string): Promise<SchedulerSubmitOutcome> => {
    const outcome = await requestMyAppointment(professionalProfileId, preferredStartsAt);
    if (outcome.status === "error") return outcome;
    addPendingRequest("new", null, outcome.request);
    setScheduling(false);
    showToast("Solicitud enviada. La clínica la revisará y te confirmará la cita.");
    return { status: "ok" };
  };

  const submitReschedule =
    (appointment: PortalAppointment) =>
    async (professionalProfileId: string, preferredStartsAt: string): Promise<SchedulerSubmitOutcome> => {
      const outcome = await requestMyAppointmentReschedule(appointment.id, professionalProfileId, preferredStartsAt);
      if (outcome.status === "error") return outcome;
      addPendingRequest("reschedule", appointment.id, outcome.request);
      showToast("Solicitud de reprogramación enviada.");
      return { status: "ok" };
    };

  const handleCancelled = (appointmentId: string) => {
    setItems((prev) => prev.map((a) => (a.id === appointmentId ? { ...a, status: "cancelled" } : a)));
    // cancel_my_appointment closes any pending reschedule for this Cita too.
    setRequestItems((prev) =>
      prev.map((r) => (r.kind === "reschedule" && r.appointmentId === appointmentId && r.status === "pending" ? { ...r, status: "rejected" } : r)),
    );
    setCancelling(null);
    showToast("Cita cancelada.");
  };

  const handleConfirmAttendance = async (appointment: PortalAppointment) => {
    setConfirmError(null);
    setConfirming(true);
    try {
      const result = await confirmMyAppointment(appointment.id);
      if (result.status === "ok") {
        setItems((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, status: result.newStatus } : a)));
        showToast("Asistencia confirmada correctamente");
      } else {
        setConfirmError(result.message);
      }
    } finally {
      setConfirming(false);
    }
  };

  if (context.status !== "ok") {
    // src/lib/supabase/proxy.ts already gates this route — reaching here
    // with anything but "ok" would mean the real session changed between
    // the gate and this render. Honest fallback, never fabricated citas.
    return (
      <div className="rounded-2xl border border-border bg-background p-5 text-center text-sm text-muted-foreground shadow-sm sm:p-6">
        No pudimos cargar tus citas. Intenta de nuevo en unos minutos.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-border bg-background p-5 text-center text-sm text-muted-foreground shadow-sm sm:p-6">
        No pudimos cargar tus citas en este momento. Intenta de nuevo más tarde.
      </div>
    );
  }

  const { nextAppointment, otherUpcoming, heroHistory, history, pendingRequest, showDirectScheduler } = buildMyAppointmentsView(
    items,
    requestItems,
  );
  const clinicPhone = context.clinic.phone;

  const historyPanel = (
    <HistoryPanel
      heroHistory={heroHistory}
      hasHistory={history.length > 0}
      onSelect={setSelectedAppointment}
      onShowAll={() => setShowFullHistory(true)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Próxima cita — the approved layout (git dd85c80): ONE protagonist
          card with Profesional | Datos de la cita | Historial de citas side
          by side on wide screens, "Agendar nueva cita" below. Real data only
          (my-appointments-view.ts); with no upcoming Cita it shows an honest
          empty state inside the same structure — never a fictitious cita,
          and never the scheduler as the default view. */}
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6 md:mx-auto md:w-full md:max-w-4xl">
        {scheduling ? (
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Agendar nueva cita</h2>
              <button
                type="button"
                onClick={() => setScheduling(false)}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                ← Volver a Mis citas
              </button>
            </div>
            <RequestAppointmentScheduler professionals={professionals} onSubmit={submitNewRequest} />
          </div>
        ) : (
          <>
            <h2 className="text-base font-semibold">
              {showDirectScheduler ? "Agenda tu próxima cita con nosotros" : "Próxima cita"}
            </h2>
            {nextAppointment ? (
              <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,240px)_1fr_minmax(0,260px)]">
                <ProfessionalCard appointment={nextAppointment} clinicPhone={clinicPhone} />
                <AppointmentDetails
                  appointment={nextAppointment}
                  clinicName={context.clinic.name}
                  onConfirm={() => handleConfirmAttendance(nextAppointment)}
                  confirming={confirming}
                  confirmError={confirmError}
                  pendingReschedule={pendingRescheduleFor(nextAppointment.id, requestItems)}
                  onReschedule={() => setRescheduling(nextAppointment)}
                  onCancel={() => setCancelling(nextAppointment)}
                />
                {historyPanel}
              </div>
            ) : showDirectScheduler ? (
              // No upcoming Cita and nothing pending → straight into the
              // real scheduler (same component/flow as "Agendar nueva
              // cita"), history still alongside.
              <div className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-[1fr_minmax(0,260px)]">
                <RequestAppointmentScheduler professionals={professionals} onSubmit={submitNewRequest} />
                {historyPanel}
              </div>
            ) : (
              // No upcoming Cita but a NEW request is already pending: show
              // it clearly and never offer a usable scheduler (the button is
              // the disabled "Solicitud pendiente" — one pending at a time).
              <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[1fr_minmax(0,260px)]">
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">No tienes una cita próxima.</p>
                  {pendingRequest && (
                    // A pending Solicitud is NOT a Cita — never rendered as one.
                    <p className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
                      Tienes una solicitud de cita pendiente — {formatDateLabel(pendingRequest.preferredStartsAt)},{" "}
                      {formatTimeLabel(pendingRequest.preferredStartsAt)} con {pendingRequest.professionalName}. La clínica la
                      revisará y te confirmará la cita.
                    </p>
                  )}
                  <ScheduleButton pending={Boolean(pendingRequest)} onClick={() => setScheduling(true)} primary />
                </div>
                {historyPanel}
              </div>
            )}
          </>
        )}
      </div>

      {/* Secondary once Próxima cita already has the spotlight — same
          placement as the approved design's own "Agendar nueva cita". */}
      {nextAppointment && !scheduling && (
        <div className="flex justify-center">
          <ScheduleButton pending={Boolean(pendingRequest)} onClick={() => setScheduling(true)} />
        </div>
      )}

      {otherUpcoming.length > 0 && (
        <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold">Otras citas próximas</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {otherUpcoming.map((appt) => (
              <UpcomingRow key={appt.id} item={appt} onSelect={() => setSelectedAppointment(appt)} />
            ))}
          </ul>
        </div>
      )}

      {/* Solicitudes de cita — the Patient's own requests only
          (appointment_requests_select_own_via_patient_link). Deliberately a
          card of its OWN, never merged into "citas": a Solicitud is a
          different entity with a different lifecycle
          (Pendiente/Aceptada/Rechazada), and conflating the two is exactly
          what CLAUDE.md forbids. Only rendered when the patient actually
          has requests. */}
      {requestItems.length > 0 && (
        <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold">Solicitudes de cita</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">La clínica confirma la fecha definitiva</p>

          <ul className="mt-3 flex flex-col gap-2">
            {requestItems.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                acceptedAppointment={
                  request.acceptedAppointmentId
                    ? (items.find((a) => a.id === request.acceptedAppointmentId) ?? null)
                    : null
                }
                onSelectAppointment={setSelectedAppointment}
              />
            ))}
          </ul>
        </div>
      )}

      {showFullHistory && (
        <HistoryModal
          history={history}
          onClose={() => setShowFullHistory(false)}
          onSelectItem={(item) => setSelectedAppointment(item)}
        />
      )}

      {rescheduling && (
        <RescheduleModal
          appointment={rescheduling}
          professionals={professionals}
          onSubmit={submitReschedule(rescheduling)}
          onClose={() => setRescheduling(null)}
        />
      )}

      {cancelling && (
        <CancelAppointmentModal
          appointment={cancelling}
          clinicName={context.clinic.name}
          onCancelled={handleCancelled}
          onClose={() => setCancelling(null)}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          clinicName={context.clinic.name}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}

// One Solicitud row — fecha/hora PREFERIDA (never presented as a confirmed
// cita), profesional, and the request's own real status. An accepted one
// links through to the Cita the clinic actually created
// (accepted_appointment_id), which is the only place the two entities ever
// touch in this screen.
function RequestRow({
  request,
  acceptedAppointment,
  onSelectAppointment,
}: {
  request: PortalAppointmentRequest;
  acceptedAppointment: PortalAppointment | null;
  onSelectAppointment: (appointment: PortalAppointment) => void;
}) {
  const content = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {request.kind === "reschedule" ? "Reprogramación · " : ""}
          {formatDateLabel(request.preferredStartsAt)}, {formatTimeLabel(request.preferredStartsAt)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {request.professionalName}
          {request.status === "pending" && " · Fecha y hora preferidas"}
          {acceptedAppointment &&
            ` · Cita agendada para ${formatDateLabel(acceptedAppointment.startsAt)}, ${formatTimeLabel(acceptedAppointment.startsAt)}`}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${REQUEST_STATUS_STYLES[request.status]}`}
      >
        {REQUEST_STATUS_LABELS[request.status]}
      </span>
    </>
  );

  return (
    <li>
      {acceptedAppointment ? (
        <button
          type="button"
          onClick={() => onSelectAppointment(acceptedAppointment)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5 text-left transition-colors hover:bg-foreground/5"
        >
          {content}
        </button>
      ) : (
        <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
          {content}
        </div>
      )}
    </li>
  );
}

// "Agendar nueva cita" — opens the real scheduler in place. Disabled while a
// Solicitud is already pending (at most one at a time, enforced in Postgres).
function ScheduleButton({ pending, onClick, primary = false }: { pending: boolean; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-primary text-primary-foreground hover:opacity-90"
          : "border border-border bg-background text-foreground/80 hover:bg-foreground/5"
      }`}
    >
      {pending ? "Solicitud pendiente" : "Agendar nueva cita"}
    </button>
  );
}

// "Historial de citas" — the approved right-hand panel of the Próxima cita
// card (bg-surface timeline), shown with or without an upcoming Cita, with
// its own honest empty state. "Ver historial completo" opens the full list.
function HistoryPanel({
  heroHistory,
  hasHistory,
  onSelect,
  onShowAll,
}: {
  heroHistory: PortalAppointment[];
  hasHistory: boolean;
  onSelect: (item: PortalAppointment) => void;
  onShowAll: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface p-4">
      <h3 className="text-sm font-semibold">Historial de citas</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Últimas atenciones</p>
      {heroHistory.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Aún no tienes citas pasadas.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2 border-l border-border/70 pl-4">
          {heroHistory.map((item) => (
            <HistoryRow key={item.id} item={item} onSelect={() => onSelect(item)} />
          ))}
        </ol>
      )}
      {hasHistory && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 w-full rounded-lg border border-border px-3 py-1.5 text-center text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
        >
          Ver historial completo
        </button>
      )}
    </div>
  );
}

// Profesional — same credential-card language as before, real data: avatar/
// name/specialty/registro come from get_my_appointment_professionals (see
// appointments-data.ts); "Contactar clínica" now uses the clinic's own real
// phone (clinics.phone via resolvePatientContext) instead of a hardcoded
// mock number, and is omitted entirely if the clinic has none on file
// (never invented).
function ProfessionalCard({ appointment, clinicPhone }: { appointment: PortalAppointment; clinicPhone: string | null }) {
  const professional = professionalCardFields(appointment);
  return (
    <div className="rounded-xl border border-border bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 md:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <UserAvatar
            name={professional.name}
            initials={professional.initials}
            avatar_url={professional.avatarUrl}
            sizeClassName="size-14"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{professional.name}</p>
            {professional.specialty && <p className="truncate text-xs text-muted-foreground">{professional.specialty}</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1.5">
          {professional.licenseNumber && (
            <div>
              <dt className="text-[10px] text-label-foreground">Registro profesional</dt>
              <dd className="text-xs font-medium">{professional.licenseNumber}</dd>
            </div>
          )}
          {clinicPhone && (
            <a
              href={waLink(clinicPhone)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-background px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
            >
              <PhoneIcon className="size-3" />
              Contactar clínica
            </a>
          )}
        </div>
      </div>

      <div className="hidden md:block">
        <div className="flex flex-col items-center gap-1 text-center">
          <UserAvatar
            name={professional.name}
            initials={professional.initials}
            avatar_url={professional.avatarUrl}
            sizeClassName="size-20"
          />
          <p className="mt-2 text-base font-semibold">{professional.name}</p>
          {professional.specialty && <p className="text-sm text-muted-foreground">{professional.specialty}</p>}
        </div>

        {professional.licenseNumber && (
          <>
            <div className="mt-5 border-t border-border" />
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <div>
                <dt className="text-label-foreground">Registro profesional</dt>
                <dd className="mt-0.5 font-medium">{professional.licenseNumber}</dd>
              </div>
            </dl>
          </>
        )}

        {clinicPhone && (
          <a
            href={waLink(clinicPhone)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-background px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            <PhoneIcon className="size-3" />
            Contactar clínica
          </a>
        )}
      </div>
    </div>
  );
}

// Datos de la cita — real fields only: fecha/hora (startsAt), estado (via
// getDisplayStatus so a stale non-terminal cita reads "Sin cerrar", never
// auto-completed), tratamiento (reason), clínica, consultorio (room, only
// if present — a real but optional snapshot column), duración. Never shows
// notes (internal/clinic-facing, not part of the approved Patient-visible
// field list) nor anything invented.
function AppointmentDetails({
  appointment,
  clinicName,
  onConfirm,
  confirming,
  confirmError,
  pendingReschedule,
  onReschedule,
  onCancel,
}: {
  appointment: PortalAppointment;
  clinicName: string;
  onConfirm: () => void;
  confirming: boolean;
  confirmError: string | null;
  pendingReschedule: PortalAppointmentRequest | null;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const displayStatus = getDisplayStatus(appointment);
  const canConfirm = canPatientConfirmAppointment(appointment);
  const canChange = canPatientChangeAppointment(appointment);
  return (
    <div className="flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-semibold text-foreground">{formatDateLabel(appointment.startsAt)}</p>
            <p className="mt-0.5 text-sm text-foreground/80">
              {formatTimeLabel(appointment.startsAt)} · {appointment.durationMinutes} min
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusStyle(displayStatus)}`}>
            {getStatusLabel(displayStatus)}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-label-foreground">Tratamiento</dt>
            <dd className="font-medium">{appointmentReasonLabel(appointment)}</dd>
          </div>
          <div>
            <dt className="text-xs text-label-foreground">Clínica</dt>
            <dd className="font-medium">{clinicName}</dd>
          </div>
          {appointment.room && (
            <div>
              <dt className="text-xs text-label-foreground">Consultorio</dt>
              <dd className="font-medium">{appointment.room}</dd>
            </div>
          )}
        </dl>

        {pendingReschedule && (
          <p className="mt-3 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
            Solicitud de reprogramación pendiente — {formatDateLabel(pendingReschedule.preferredStartsAt)},{" "}
            {formatTimeLabel(pendingReschedule.preferredStartsAt)} con {pendingReschedule.professionalName}. Tu cita actual
            sigue vigente hasta que la clínica apruebe el cambio.
          </p>
        )}
      </div>

      {/* Real actions only (see appointment-eligibility.ts; the backend
          re-checks every one): Confirmar asistencia, Reprogramar (a
          request) and Cancelar cita — only while the Cita is her own,
          future and still scheduled/confirmed. */}
      {(canConfirm || canChange) && (
        <div className="flex flex-col gap-2">
          {canConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {confirming ? "Confirmando…" : "Confirmar asistencia"}
            </button>
          )}
          {confirmError && <p className="text-xs text-danger">{confirmError}</p>}
          {canChange && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onReschedule}
                disabled={Boolean(pendingReschedule)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingReschedule ? "Solicitud pendiente" : "Reprogramar"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-danger/20 bg-background px-3 py-2 text-sm font-medium text-danger/80 hover:bg-danger/5 hover:text-danger"
              >
                Cancelar cita
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UpcomingRow({ item, onSelect }: { item: PortalAppointment; onSelect: () => void }) {
  const displayStatus = getDisplayStatus(item);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5 text-left transition-colors hover:bg-foreground/5"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {formatDateLabel(item.startsAt)}, {formatTimeLabel(item.startsAt)} · {appointmentReasonLabel(item)}
          </p>
          <p className="truncate text-xs text-muted-foreground">{item.professionalName}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusStyle(displayStatus)}`}>
          {getStatusLabel(displayStatus)}
        </span>
      </button>
    </li>
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
  history: PortalAppointment[];
  onClose: () => void;
  onSelectItem: (item: PortalAppointment) => void;
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

        <div className="flex-1 overflow-y-auto bg-surface px-5 py-4">
          {history.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Aún no tienes citas pasadas.</p>
          ) : (
            <ol className="flex flex-col gap-2 border-l border-border/70 pl-4">
              {history.map((item) => (
                <HistoryRow key={item.id} item={item} onSelect={() => onSelectItem(item)} />
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// Timeline row for "Historial de citas" — fecha/hora + badge on top,
// tratamiento and profesional each on their own line below. Shared by the
// hero preview and the "Ver historial completo" modal. Always clickable —
// opens the same read-only AppointmentDetailModal any other appointment
// row does (real appointments have no dedicated "motivo de cancelación"
// column to gate this on, unlike the old mock).
function HistoryRow({ item, onSelect }: { item: PortalAppointment; onSelect: () => void }) {
  const displayStatus = getDisplayStatus(item);
  return (
    <li className="relative">
      <span
        className="absolute -left-[19px] top-1.5 size-1.5 rounded-full bg-muted-foreground/40 ring-4 ring-surface"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={onSelect}
        className="w-full rounded-lg px-2 py-1 text-left leading-tight transition-colors hover:bg-foreground/5"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-label-foreground">
            {formatDateLabel(item.startsAt)} · {formatTimeLabel(item.startsAt)}
          </span>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${getHistoryStatusBadgeClass(displayStatus)}`}
          >
            {getStatusLabel(displayStatus)}
          </span>
        </div>
        <p className="mt-0.5 text-xs font-medium text-foreground">{appointmentReasonLabel(item)}</p>
        <p className="mt-0.5 text-[10px] text-label-foreground">{item.professionalName}</p>
      </button>
    </li>
  );
}

// Read-only detail for any appointment row (próximas or historial) — the
// patient may only ever reach her OWN appointments here, since the list
// itself is already scoped by fetchMyAppointments. No "motivo de
// cancelación": real appointments carry no such column (the old mock's
// cancellationReason has no real source — see task scope's "don't invent
// additional clinical data").
function AppointmentDetailModal({
  appointment,
  clinicName,
  onClose,
}: {
  appointment: PortalAppointment;
  clinicName: string;
  onClose: () => void;
}) {
  const displayStatus = getDisplayStatus(appointment);
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
              {formatDateLabel(appointment.startsAt)}, {formatTimeLabel(appointment.startsAt)}
            </p>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getHistoryStatusBadgeClass(displayStatus)}`}
            >
              {getStatusLabel(displayStatus)}
            </span>
          </div>

          <dl className="mt-4 flex flex-col gap-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-label-foreground">Tratamiento</dt>
              <dd className="font-medium">{appointmentReasonLabel(appointment)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-label-foreground">Profesional</dt>
              <dd className="font-medium">{appointment.professionalName}</dd>
            </div>
            {appointment.professionalSpecialty && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-label-foreground">Especialidad</dt>
                <dd className="font-medium">{appointment.professionalSpecialty}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt className="text-label-foreground">Clínica</dt>
              <dd className="font-medium">{clinicName}</dd>
            </div>
            {appointment.room && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-label-foreground">Consultorio</dt>
                <dd className="font-medium">{appointment.room}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt className="text-label-foreground">Duración</dt>
              <dd className="font-medium">{appointment.durationMinutes} min</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

// "Reprogramar cita" — the approved modal: the CURRENT Cita's real summary,
// then the same real picker as "Agendar nueva cita" (preselected on her
// current professional) and "Solicitar reprogramación". Sends a REQUEST;
// the Cita itself is untouched until the clinic accepts it.
function RescheduleModal({
  appointment,
  professionals,
  onSubmit,
  onClose,
}: {
  appointment: PortalAppointment;
  professionals: PortalProfessional[];
  onSubmit: (professionalProfileId: string, preferredStartsAt: string) => Promise<SchedulerSubmitOutcome>;
  onClose: () => void;
}) {
  const [sent, setSent] = useState(false);

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
            <p className="py-6 text-center text-sm font-medium text-foreground">
              Solicitud de reprogramación enviada. Tu cita actual continúa vigente hasta que la clínica apruebe el cambio.
            </p>
          ) : (
            <>
              <dl className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-label-foreground">Cita actual</dt>
                  <dd className="font-medium">
                    {formatDateLabel(appointment.startsAt)}, {formatTimeLabel(appointment.startsAt)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-label-foreground">Tratamiento</dt>
                  <dd className="font-medium">{appointmentReasonLabel(appointment)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-xs text-label-foreground">Odontólogo</dt>
                  <dd className="font-medium">{appointment.professionalName}</dd>
                </div>
              </dl>

              <RequestAppointmentScheduler
                professionals={professionals}
                initialProfessionalId={appointment.professionalProfileId}
                submitLabel="Solicitar reprogramación"
                skipConfirm
                currentSlot={{ professionalProfileId: appointment.professionalProfileId, startsAt: appointment.startsAt }}
                onSubmit={async (professionalProfileId, preferredStartsAt) => {
                  const outcome = await onSubmit(professionalProfileId, preferredStartsAt);
                  if (outcome.status === "ok") setSent(true);
                  return outcome;
                }}
              />
            </>
          )}
        </div>

        {sent && (
          <div className="shrink-0 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// "Cancelar cita" — the approved confirmation modal with the Cita's real
// data and the approved "Motivo de cancelación" options
// (cancellation-reasons.ts). Cancels for real via cancel_my_appointment —
// the view updates only after the backend confirms.
function CancelAppointmentModal({
  appointment,
  clinicName,
  onCancelled,
  onClose,
}: {
  appointment: PortalAppointment;
  clinicName: string;
  onCancelled: (appointmentId: string) => void;
  onClose: () => void;
}) {
  const [reasonCode, setReasonCode] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOther = reasonCode === "other";
  const canConfirm = isValidCancellationInput(reasonCode, detail) && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    const outcome = await cancelMyAppointment(appointment.id, reasonCode, isOther ? detail.trim() : null);
    setSubmitting(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    onCancelled(appointment.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={submitting ? undefined : onClose}>
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
            disabled={submitting}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5 disabled:opacity-40"
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
                {formatDateLabel(appointment.startsAt)}, {formatTimeLabel(appointment.startsAt)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Tratamiento</dt>
              <dd className="font-medium">{appointmentReasonLabel(appointment)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Odontólogo</dt>
              <dd className="font-medium">{appointment.professionalName}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-label-foreground">Clínica</dt>
              <dd className="font-medium">{clinicName}</dd>
            </div>
          </dl>

          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Motivo de cancelación</span>
            <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} disabled={submitting} className={FIELD_CLASS}>
              <option value="">Selecciona un motivo</option>
              {CANCELLATION_REASONS.map((reason) => (
                <option key={reason.code} value={reason.code}>
                  {reason.label}
                </option>
              ))}
            </select>
          </label>

          {isOther && (
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              disabled={submitting}
              placeholder="Cuéntanos brevemente el motivo"
              rows={3}
              className={`${FIELD_CLASS} mt-2 resize-none`}
            />
          )}

          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-40"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-danger px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Cancelando…" : "Cancelar cita"}
          </button>
        </div>
      </div>
    </div>
  );
}
