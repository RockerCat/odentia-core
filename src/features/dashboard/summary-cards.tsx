"use client"; // needed for the open-KPI modal state below.

import { useEffect, useState, type ReactNode } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { AppointmentDetailModal } from "./appointment-detail-modal";
import { ClinicalEncounterScreen } from "./clinical-encounter-screen";
import type { Appointment, Dentist, OperationalAlert, WeekDay } from "./mock-data";
import { STATUS_LABELS, STATUS_STYLES } from "./mock-data";

// Same shape as SummaryMetric, except the icon arrives pre-rendered — a
// Server Component (AgendaPage) can't hand a raw component reference
// across the client boundary, only serializable JSX.
type DisplayMetric = { label: string; value: string; subtitle: string; icon: ReactNode };

type KpiKey = "citas-hoy" | "confirmadas" | "pendientes" | "alertas";

// Maps each card's label to which underlying records it represents — the
// KPI values themselves (TODAY_SUMMARY) are untouched; this only decides
// what to show when a card is opened.
function kpiKeyForLabel(label: string): KpiKey | null {
  switch (label) {
    case "Citas hoy":
      return "citas-hoy";
    case "Confirmadas":
      return "confirmadas";
    case "Pendientes de confirmar":
      return "pendientes";
    case "Alertas":
      return "alertas";
    default:
      return null;
  }
}

export function SummaryCards({
  metrics,
  appointments,
  weekDays,
  dentists,
  alerts,
}: {
  metrics: DisplayMetric[];
  appointments: Appointment[];
  weekDays: WeekDay[];
  dentists: Dentist[];
  alerts: OperationalAlert[];
}) {
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);
  // Local copy so a row's detail modal can simulate edits (see
  // AppointmentsCard's identical pattern) — this prototype phase simulates
  // CRUD with local state instead of a real backend (see PROJECT_STATUS.md).
  const [allAppointments, setAllAppointments] = useState(appointments);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  // Same "Iniciar atención" wiring as AppointmentsCard — see its identical
  // encounterAppointmentId state for why this is separate from
  // selectedAppointmentId.
  const [encounterAppointmentId, setEncounterAppointmentId] = useState<string | null>(null);
  const todayDay = weekDays.find((day) => day.isToday);
  // Same filter that already produces TODAY_SUMMARY's "Citas hoy"/
  // "Confirmadas"/"Pendientes de confirmar" totals — not a new definition,
  // just the record list behind those existing numbers.
  const todayAppointments = allAppointments.filter((a) => a.day === todayDay?.key);

  const updateAppointment = (updated: Appointment) => {
    setAllAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const addAppointment = (created: Appointment) => {
    setAllAppointments((prev) => [...prev, created]);
  };

  const openAppointmentDetail = (id: string) => {
    setOpenKpi(null);
    setSelectedAppointmentId(id);
  };

  const selectedAppointment = allAppointments.find((a) => a.id === selectedAppointmentId) ?? null;
  const encounterAppointment = allAppointments.find((a) => a.id === encounterAppointmentId) ?? null;

  const recordsForKey = (key: KpiKey) => {
    switch (key) {
      case "citas-hoy":
        return { kind: "appointments" as const, items: todayAppointments };
      case "confirmadas":
        return {
          kind: "appointments" as const,
          items: todayAppointments.filter((a) => a.status === "confirmed"),
        };
      case "pendientes":
        return {
          kind: "appointments" as const,
          items: todayAppointments.filter((a) => a.status === "pending"),
        };
      case "alertas":
        return { kind: "alerts" as const, items: alerts };
    }
  };

  const openMetric = metrics.find((m) => kpiKeyForLabel(m.label) === openKpi);

  return (
    <div className="grid grid-cols-2 gap-3">
      {metrics.map((metric) => {
        const kpiKey = kpiKeyForLabel(metric.label);
        return (
          <button
            key={metric.label}
            type="button"
            onClick={() => kpiKey && setOpenKpi(kpiKey)}
            disabled={!kpiKey}
            className="flex flex-col items-center rounded-lg border border-border bg-background p-3.5 text-center transition-colors hover:border-primary/30 hover:bg-primary/[0.03] disabled:cursor-default disabled:hover:border-border disabled:hover:bg-background"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              {metric.icon}
            </span>
            <p className="mt-2 text-2xl font-bold tracking-tight">{metric.value}</p>
            <p className="mt-1 max-w-full truncate text-[10px] text-label-foreground" title={metric.label}>
              {metric.label}
            </p>
            <p className="max-w-full truncate text-[10px] text-label-foreground" title={metric.subtitle}>
              {metric.subtitle}
            </p>
          </button>
        );
      })}

      {openKpi && openMetric && (
        <KpiDetailModal
          title={openMetric.label}
          records={recordsForKey(openKpi)}
          dentists={dentists}
          todayDateLabel={todayDay?.dateLabel ?? ""}
          onClose={() => setOpenKpi(null)}
          onOpenPending={() => setOpenKpi("pendientes")}
          onSelectAppointment={openAppointmentDetail}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          allAppointments={allAppointments}
          dentists={dentists}
          weekDays={weekDays}
          onClose={() => setSelectedAppointmentId(null)}
          onUpdate={updateAppointment}
          onStartEncounter={() => {
            setSelectedAppointmentId(null);
            setEncounterAppointmentId(selectedAppointment.id);
          }}
        />
      )}

      {encounterAppointment && (
        <ClinicalEncounterScreen
          appointment={encounterAppointment}
          dentists={dentists}
          allAppointments={allAppointments}
          weekDays={weekDays}
          onExit={() => setEncounterAppointmentId(null)}
          onComplete={() => {
            updateAppointment({ ...encounterAppointment, status: "completed" });
            setEncounterAppointmentId(null);
          }}
          onCreateAppointment={addAppointment}
          onUpdateAppointment={updateAppointment}
        />
      )}
    </div>
  );
}

function KpiDetailModal({
  title,
  records,
  dentists,
  todayDateLabel,
  onClose,
  onOpenPending,
  onSelectAppointment,
}: {
  title: string;
  records: { kind: "appointments"; items: Appointment[] } | { kind: "alerts"; items: OperationalAlert[] };
  dentists: Dentist[];
  todayDateLabel: string;
  onClose: () => void;
  onOpenPending: () => void;
  onSelectAppointment: (id: string) => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const isEmpty = records.items.length === 0;

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
          {isEmpty ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No hay registros para este indicador.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {records.kind === "appointments"
                ? records.items.map((appointment) => (
                    <AppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                      dentistName={
                        dentists.find((d) => d.id === appointment.dentistId)?.name ?? "Sin asignar"
                      }
                      dateLabel={todayDateLabel}
                      onSelect={() => onSelectAppointment(appointment.id)}
                    />
                  ))
                : records.items.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} onOpenPending={onOpenPending} />
                  ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function AppointmentRow({
  appointment,
  dentistName,
  dateLabel,
  onSelect,
}: {
  appointment: Appointment;
  dentistName: string;
  dateLabel: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.03]"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{appointment.patientName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {dentistName} · {dateLabel} · {appointment.time}
            {appointment.room ? ` · ${appointment.room}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appointment.status]}`}
        >
          {STATUS_LABELS[appointment.status]}
        </span>
      </button>
    </li>
  );
}

function AlertRow({ alert, onOpenPending }: { alert: OperationalAlert; onOpenPending: () => void }) {
  // The "esperando confirmación" alert is the only warning-toned one — reuse
  // that existing tone to identify it and to open the same "Pendientes de
  // confirmar" listing, instead of duplicating a second source of truth.
  if (alert.tone === "warning") {
    return (
      <li>
        <button
          type="button"
          onClick={onOpenPending}
          className="w-full rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5 text-left transition-colors hover:bg-warning/15"
        >
          <p className="text-sm font-medium text-warning">{alert.message}</p>
          {alert.description && <p className="mt-0.5 text-xs text-warning/80">{alert.description}</p>}
        </button>
      </li>
    );
  }

  return (
    <li className="cursor-pointer rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-primary/[0.03]">
      <p className="text-sm font-medium">{alert.message}</p>
      {alert.description && <p className="mt-0.5 text-xs text-muted-foreground">{alert.description}</p>}
    </li>
  );
}
