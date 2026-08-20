"use client";

import { useState } from "react";
import { BellIcon, FlagIcon, PlusIcon } from "@/components/shell/icons";
import { formatClockLabel } from "@/lib/format";
import { AusenciaModal } from "./ausencia-modal";
import {
  ABSENCES_MOCK,
  DENTIST_NOTIFICATION_DEFAULTS,
  DENTIST_NOTIFICATION_ITEMS,
  type Absence,
  type DentistNotificationKey,
} from "./dentist-mock-data";
import { ToggleSwitch } from "./toggle-switch";

// Odontólogo > Configuración — distinct from the Clinic Admin's
// settings-screen.tsx (see task scope): only Ausencias (temporary
// exceptions to the dentist's regular availability, which continues to be
// managed from their profile — see task scope) and personal notification
// preferences. No Agenda display settings, intervals, appointment
// duration, or regional preferences here — those are clinic-wide and
// already live in the Clinic Admin's screen. UI/UX only, local mock
// state, nothing persisted, no backend.
export function DentistSettingsScreen() {
  const [absences, setAbsences] = useState<Absence[]>(ABSENCES_MOCK);
  const [modal, setModal] = useState<"closed" | "create" | Absence>("closed");
  const [notifications, setNotifications] = useState(DENTIST_NOTIFICATION_DEFAULTS);

  const toggleNotification = (key: DentistNotificationKey) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">Preferencias personales de tu agenda y notificaciones.</p>

      {/* Single column on mobile/tablet; desktop lays the two sections out
          50/50 (see task scope), same lg: breakpoint/grid approach as Mi
          Suscripción and the Clinic Admin's Configuración. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2">
        <AusenciasSection
          absences={absences}
          onCreate={(absence) => setAbsences((prev) => [...prev, absence])}
          onUpdate={(absence) =>
            setAbsences((prev) => prev.map((a) => (a.id === absence.id ? absence : a)))
          }
          onDelete={(id) => setAbsences((prev) => prev.filter((a) => a.id !== id))}
          modal={modal}
          onOpenModal={setModal}
        />

        <NotificacionesSection notifications={notifications} onToggle={toggleNotification} />
      </div>
    </div>
  );
}

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDateRangeLabel(startISO: string, endISO: string): string {
  const [startY, startM, startD] = startISO.split("-").map(Number);
  if (startISO === endISO) return `${startD} ${MONTH_LABELS[startM - 1]} ${startY}`;

  const [endY, endM, endD] = endISO.split("-").map(Number);
  if (startM === endM && startY === endY) {
    return `${startD} – ${endD} ${MONTH_LABELS[endM - 1]} ${endY}`;
  }
  return `${startD} ${MONTH_LABELS[startM - 1]} – ${endD} ${MONTH_LABELS[endM - 1]} ${endY}`;
}

function formatTimeRangeLabel(startTime: string, endTime: string): string {
  const [startH, startMin] = startTime.split(":").map(Number);
  const [endH, endMin] = endTime.split(":").map(Number);
  const start = formatClockLabel(new Date(2000, 0, 1, startH, startMin));
  const end = formatClockLabel(new Date(2000, 0, 1, endH, endMin));
  return `${start} – ${end}`;
}

function AusenciasSection({
  absences,
  onCreate,
  onUpdate,
  onDelete,
  modal,
  onOpenModal,
}: {
  absences: Absence[];
  onCreate: (absence: Absence) => void;
  onUpdate: (absence: Absence) => void;
  onDelete: (id: string) => void;
  modal: "closed" | "create" | Absence;
  onOpenModal: (modal: "closed" | "create" | Absence) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FlagIcon className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Ausencias programadas</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Excepciones temporales a tu disponibilidad habitual.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenModal("create")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
        >
          <PlusIcon className="size-3.5" />
          Nueva ausencia
        </button>
      </div>

      {absences.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No tienes ausencias programadas.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {absences.map((absence) => (
            <li key={absence.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{absence.reason}</p>
                  <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
                    Próxima
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateRangeLabel(absence.startDate, absence.endDate)} ·{" "}
                  {absence.allDay
                    ? "Todo el día"
                    : formatTimeRangeLabel(absence.startTime ?? "00:00", absence.endTime ?? "00:00")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenModal(absence)}
                  className="text-xs font-medium text-primary hover:text-primary/80"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(absence.id)}
                  className="text-xs font-medium text-danger/80 hover:text-danger"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal !== "closed" && (
        <AusenciaModal
          editing={modal === "create" ? null : modal}
          onClose={() => onOpenModal("closed")}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}

function NotificacionesSection({
  notifications,
  onToggle,
}: {
  notifications: Record<DentistNotificationKey, boolean>;
  onToggle: (key: DentistNotificationKey) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BellIcon className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Mis notificaciones</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Preferencias personales de aviso.</p>
        </div>
      </div>

      <div className="mt-3 divide-y divide-border">
        {DENTIST_NOTIFICATION_ITEMS.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
            </div>
            <div className="mt-0.5 shrink-0">
              <ToggleSwitch label={item.label} checked={notifications[item.key]} onChange={() => onToggle(item.key)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
