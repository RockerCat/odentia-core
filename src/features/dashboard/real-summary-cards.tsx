"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, CalendarIcon, CheckCircleIcon, ClockIcon, CloseIcon } from "@/components/shell/icons";
import type { MembershipRole } from "@/features/session/types";
import type { Appointment, ClinicalProfessional } from "./appointments-data";
import { REAL_STATUS_LABELS, REAL_STATUS_STYLES } from "./real-status";
import { formatDateLabel, formatTimeLabel } from "./real-format";
import { RealAppointmentDetailModal } from "./real-appointment-detail-modal";
import { toBoardProfessional, type BoardProfessional } from "./real-appointments-board";

// Real /agenda KPI cards — separate, distinctly-named component from
// summary-cards.tsx (still 100% mock). Shares appointment DATA with
// RealAppointmentsBoard via the parent (real-agenda-screen.tsx), instead of
// keeping its own independent local copy the way the mock's SummaryCards
// did (see that file's own comment on `allAppointments`) — both components
// read `todayAppointments` from one source and report edits back through
// the same `onAppointmentUpdated` callback.
//
// "Alertas" has no real backing table in this iteration (OPERATIONAL_ALERTS
// was clinic-wide mock data unrelated to appointments) — shown as an honest
// empty state, not a fabricated count, and non-interactive (no detail modal
// for it), matching the "real data or honest empty state" rule.

type KpiKey = "citas-hoy" | "confirmadas" | "pendientes";

export function RealSummaryCards({
  role,
  ownProfessionalProfileId,
  todayAppointments,
  professionals: rawProfessionals,
  treatmentOptions,
  roomOptions,
  onAppointmentUpdated,
}: {
  role: MembershipRole;
  ownProfessionalProfileId: string | null;
  todayAppointments: Appointment[];
  professionals: ClinicalProfessional[];
  treatmentOptions: string[];
  roomOptions: string[];
  onAppointmentUpdated: (updated: Appointment) => void;
}) {
  const router = useRouter();
  const professionals = rawProfessionals.map(toBoardProfessional);
  const isDentist = role === "dentist";
  const scopedToday = isDentist ? todayAppointments.filter((a) => a.professionalProfileId === ownProfessionalProfileId) : todayAppointments;

  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const openAppointmentDetail = (id: string) => {
    setOpenKpi(null);
    setSelectedAppointmentId(id);
  };

  const selectedAppointment = todayAppointments.find((a) => a.id === selectedAppointmentId) ?? null;

  const confirmedToday = scopedToday.filter((a) => a.status === "confirmed").length;
  const pendingToday = scopedToday.filter((a) => a.status === "scheduled").length;
  const percentOfToday = (count: number) =>
    scopedToday.length > 0 ? `${Math.round((count / scopedToday.length) * 100)}% del total` : "0% del total";

  const metrics: { key: KpiKey | null; label: string; value: string; subtitle: string; icon: React.ReactNode }[] = [
    { key: "citas-hoy", label: "Citas hoy", value: String(scopedToday.length), subtitle: "Total programadas", icon: <CalendarIcon className="size-4" /> },
    { key: "confirmadas", label: "Confirmadas", value: String(confirmedToday), subtitle: percentOfToday(confirmedToday), icon: <CheckCircleIcon className="size-4" /> },
    { key: "pendientes", label: "Pendientes de confirmar", value: String(pendingToday), subtitle: percentOfToday(pendingToday), icon: <ClockIcon className="size-4" /> },
    { key: null, label: "Alertas", value: "0", subtitle: "Sin alertas aún", icon: <BellIcon className="size-4" /> },
  ];

  const recordsForKey = (key: KpiKey): Appointment[] => {
    switch (key) {
      case "citas-hoy":
        return scopedToday;
      case "confirmadas":
        return scopedToday.filter((a) => a.status === "confirmed");
      case "pendientes":
        return scopedToday.filter((a) => a.status === "scheduled");
    }
  };

  const openMetric = metrics.find((m) => m.key === openKpi);
  const todayDateLabel = formatDateLabel(new Date().toISOString());

  return (
    <div className="grid grid-cols-2 gap-3">
      {metrics.map((metric) => (
        <button
          key={metric.label}
          type="button"
          onClick={() => metric.key && setOpenKpi(metric.key)}
          disabled={!metric.key}
          className="flex flex-col items-center rounded-lg border border-border bg-background p-3.5 text-center transition-colors hover:border-primary/30 hover:bg-primary/[0.03] disabled:cursor-default disabled:hover:border-border disabled:hover:bg-background"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{metric.icon}</span>
          <p className="mt-2 text-2xl font-bold tracking-tight">{metric.value}</p>
          <p className="mt-1 max-w-full truncate text-[10px] text-label-foreground" title={metric.label}>
            {metric.label}
          </p>
          <p className="max-w-full truncate text-[10px] text-label-foreground" title={metric.subtitle}>
            {metric.subtitle}
          </p>
        </button>
      ))}

      {openKpi && openMetric && (
        <KpiDetailModal
          title={openMetric.label}
          items={recordsForKey(openKpi)}
          professionals={professionals}
          todayDateLabel={todayDateLabel}
          onClose={() => setOpenKpi(null)}
          onSelectAppointment={openAppointmentDetail}
        />
      )}

      {selectedAppointment && (
        <RealAppointmentDetailModal
          appointment={selectedAppointment}
          professional={professionals.find((p) => p.professionalProfileId === selectedAppointment.professionalProfileId) ?? null}
          role={role}
          treatmentOptions={treatmentOptions}
          roomOptions={roomOptions}
          onClose={() => setSelectedAppointmentId(null)}
          onUpdated={(updated) => {
            onAppointmentUpdated(updated);
          }}
          onViewPatient={(patientId) => router.push(`/pacientes/${patientId}/historia-clinica`)}
        />
      )}
    </div>
  );
}

function KpiDetailModal({
  title,
  items,
  professionals,
  todayDateLabel,
  onClose,
  onSelectAppointment,
}: {
  title: string;
  items: Appointment[];
  professionals: BoardProfessional[];
  todayDateLabel: string;
  onClose: () => void;
  onSelectAppointment: (id: string) => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const isEmpty = items.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[70vh] sm:w-full sm:max-w-2xl sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5">
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3.5">
          {isEmpty ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No hay registros para este indicador.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((appointment) => (
                <li key={appointment.id}>
                  <button
                    type="button"
                    onClick={() => onSelectAppointment(appointment.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.03]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{appointment.patientName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {professionals.find((p) => p.professionalProfileId === appointment.professionalProfileId)?.name ?? "Sin asignar"} ·{" "}
                        {todayDateLabel} · {formatTimeLabel(appointment.startsAt)}
                        {appointment.room ? ` · ${appointment.room}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${REAL_STATUS_STYLES[appointment.status]}`}>
                      {REAL_STATUS_LABELS[appointment.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
