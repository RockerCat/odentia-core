"use client";

import { useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { CloseIcon, PhoneIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { formatDateLabel, formatTimeLabel, initialsOf } from "@/features/dashboard/real-format";
import { getDisplayStatus, getHistoryStatusBadgeClass, getStatusLabel, getStatusStyle } from "@/features/dashboard/real-status";
import type { PatientContext } from "@/features/session/types";
import { canPatientConfirmAppointment } from "./appointment-eligibility";
import { confirmMyAppointment } from "./appointments-actions";
import type { PortalAppointment } from "./appointments-data";
import { splitPortalAppointments } from "./appointments-split";
import { RequestAppointmentScheduler } from "./request-appointment-scheduler";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_STYLES,
  type PortalAppointmentRequest,
  type PortalProfessional,
} from "./requests-data";

const HERO_HISTORY_LIMIT = 10;

function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

// Mis citas — real data only (see appointments-data.ts's fetchMyAppointments,
// scoped by the real patient/clinic resolved via resolvePatientContext).
// Listing, real statuses (getDisplayStatus, the same "Sin cerrar" derivation
// the real Agenda uses — see CLAUDE.md's Appointment Lifecycle), and
// próximas/historial split (see appointments-split.ts) are read-only. The
// two real write paths are:
//   - "Confirmar asistencia" — confirm_my_appointment(), see
//     appointments-actions.ts: a Patient confirming her OWN attendance on
//     her OWN still-"scheduled" Cita.
//   - "Solicitar cita" — request_my_appointment(), see requests-actions.ts:
//     a Solicitud de Cita, a SEPARATE entity from a Cita (CLAUDE.md's
//     Appointment Lifecycle). It creates NO appointment and reserves no
//     slot; only the clinic accepting it does.
// Nothing else — reprogramar/cancelar by the Patient stay removed rather
// than kept as fake, non-persisting buttons from the mock version.
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
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // The clinic's decision is what turns a request into a Cita, so a brand
  // new request only ever lands here as "Pendiente" — never as an
  // optimistic appointment in `items`.
  const handleRequested = (request: { id: string; professionalProfileId: string; preferredStartsAt: string; createdAt: string }) => {
    const professionalName =
      professionals.find((p) => p.professionalProfileId === request.professionalProfileId)?.name ?? "Profesional";
    setRequestItems((prev) => [
      {
        id: request.id,
        professionalProfileId: request.professionalProfileId,
        professionalName,
        preferredStartsAt: request.preferredStartsAt,
        status: "pending",
        acceptedAppointmentId: null,
        createdAt: request.createdAt,
      },
      ...prev,
    ]);
    setShowRequestModal(false);
    showToast("Solicitud enviada. La clínica la revisará y te confirmará la cita.");
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

  const { upcoming, history } = splitPortalAppointments(items);

  const nextAppointment = upcoming[0] ?? null;
  const otherUpcoming = upcoming.slice(1);
  const heroHistory = history.slice(0, HERO_HISTORY_LIMIT);
  const clinicPhone = context.clinic.phone;
  // At most one open Solicitud at a time — the same rule
  // appointment_requests_one_pending_per_patient enforces in Postgres, and
  // the same "Solicitud pendiente" affordance the approved design already
  // used for a pending reschedule request.
  const pendingRequest = requestItems.find((r) => r.status === "pending") ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* Próxima cita — same protagonist framing as before: Profesional
          (read-only, no edit affordances for a Patient) and Datos de la
          cita side by side on wide screens. No Historial nested here
          anymore (see below) — that panel needs its own honest empty
          state independent of whether a next appointment exists. */}
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6 md:mx-auto md:max-w-4xl">
        <h2 className="text-base font-semibold">
          {nextAppointment ? "Próxima cita" : pendingRequest ? "Citas" : "Agenda tu próxima cita con nosotros"}
        </h2>

        {nextAppointment ? (
          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,240px)_1fr]">
            <ProfessionalCard appointment={nextAppointment} clinicPhone={clinicPhone} />
            <AppointmentDetails
              appointment={nextAppointment}
              clinicName={context.clinic.name}
              onConfirm={() => handleConfirmAttendance(nextAppointment)}
              confirming={confirming}
              confirmError={confirmError}
            />
          </div>
        ) : pendingRequest ? (
          // A pending Solicitud is NOT a Cita — never rendered as one. Same
          // warning-toned "solicitud pendiente" panel language the approved
          // design already used for a pending reschedule request.
          <div className="mt-3 flex flex-col gap-3">
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              No tienes citas próximas programadas.
            </p>
            <p className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
              Tienes una solicitud de cita pendiente — {formatDateLabel(pendingRequest.preferredStartsAt)},{" "}
              {formatTimeLabel(pendingRequest.preferredStartsAt)} con {pendingRequest.professionalName}. La clínica la
              revisará y te confirmará la cita.
            </p>
          </div>
        ) : (
          // No upcoming appointment and no open request — go straight into
          // requesting one instead of a dead-end empty state, exactly as
          // the approved design does (its NewAppointmentScheduler, now
          // real: see request-appointment-scheduler.tsx).
          <RequestAppointmentScheduler professionals={professionals} onRequested={handleRequested} />
        )}
      </div>

      {/* Secondary once Próxima cita already has the spotlight — same
          placement/treatment as the approved design's own "Agendar nueva
          cita", and the same "Solicitud pendiente" disabled state it used
          while one is already open. */}
      {nextAppointment && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowRequestModal(true)}
            disabled={Boolean(pendingRequest)}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingRequest ? "Solicitud pendiente" : "Solicitar nueva cita"}
          </button>
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
          has requests — a patient who has never asked for one shouldn't
          see an empty section explaining a feature she just used the hero
          card for. */}
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

      {/* Historial — its own card now, always rendered, with its own
          honest empty state (see task scope: "no historial" is a
          separate empty state from "no próximas", not implied by it). */}
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">Historial de citas</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Últimas atenciones</p>

        {heroHistory.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Aún no tienes citas pasadas.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2 border-l border-border/70 pl-4">
            {heroHistory.map((item) => (
              <HistoryRow key={item.id} item={item} onSelect={() => setSelectedAppointment(item)} />
            ))}
          </ol>
        )}

        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowFullHistory(true)}
            className="mt-3 w-full rounded-lg border border-border px-3 py-1.5 text-center text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
          >
            Ver historial completo
          </button>
        )}
      </div>

      {showFullHistory && (
        <HistoryModal
          history={history}
          onClose={() => setShowFullHistory(false)}
          onSelectItem={(item) => setSelectedAppointment(item)}
        />
      )}

      {showRequestModal && (
        <RequestAppointmentModal onClose={() => setShowRequestModal(false)}>
          <RequestAppointmentScheduler professionals={professionals} onRequested={handleRequested} />
        </RequestAppointmentModal>
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

// Same modal chrome as every other sheet in this screen — used only for
// the "Solicitar nueva cita" path (when the patient already has an
// upcoming Cita, so the hero card is showing that instead of the picker).
function RequestAppointmentModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Solicitar cita"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Solicitar cita</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </div>
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
  return (
    <div className="rounded-xl border border-border bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 md:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <UserAvatar
            name={appointment.professionalName}
            initials={initialsOf(appointment.professionalName)}
            avatar_url={appointment.professionalAvatarUrl ?? undefined}
            sizeClassName="size-14"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{appointment.professionalName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {appointment.professionalSpecialty ?? "Odontología general"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1.5">
          {appointment.professionalLicenseNumber && (
            <div>
              <dt className="text-[10px] text-label-foreground">Registro profesional</dt>
              <dd className="text-xs font-medium">{appointment.professionalLicenseNumber}</dd>
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
            name={appointment.professionalName}
            initials={initialsOf(appointment.professionalName)}
            avatar_url={appointment.professionalAvatarUrl ?? undefined}
            sizeClassName="size-20"
          />
          <p className="mt-2 text-base font-semibold">{appointment.professionalName}</p>
          <p className="text-sm text-muted-foreground">{appointment.professionalSpecialty ?? "Odontología general"}</p>
        </div>

        {appointment.professionalLicenseNumber && (
          <>
            <div className="mt-5 border-t border-border" />
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <div>
                <dt className="text-label-foreground">Registro profesional</dt>
                <dd className="mt-0.5 font-medium">{appointment.professionalLicenseNumber}</dd>
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
}: {
  appointment: PortalAppointment;
  clinicName: string;
  onConfirm: () => void;
  confirming: boolean;
  confirmError: string | null;
}) {
  const displayStatus = getDisplayStatus(appointment);
  const canConfirm = canPatientConfirmAppointment(appointment);
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
            <dd className="font-medium">{appointment.reason ?? "Consulta"}</dd>
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
      </div>

      {/* Confirmar asistencia — the only real action a Patient can take on
          her own Cita here (see appointment-eligibility.ts's own comment
          for exactly which statuses/timing qualify — mirrors
          confirm_my_appointment's own check, backend stays authoritative). */}
      {canConfirm && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming ? "Confirmando…" : "Confirmar asistencia"}
          </button>
          {confirmError && <p className="text-xs text-danger">{confirmError}</p>}
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
            {formatDateLabel(item.startsAt)}, {formatTimeLabel(item.startsAt)} · {item.reason ?? "Consulta"}
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
        <p className="mt-0.5 text-xs font-medium text-foreground">{item.reason ?? "Consulta"}</p>
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
              <dd className="font-medium">{appointment.reason ?? "Consulta"}</dd>
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
