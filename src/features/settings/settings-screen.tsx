"use client";

import { useState } from "react";
import { BellIcon, CalendarIcon, MapPinIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { AusenciasAdminSection } from "./ausencias-admin-section";
import {
  AGENDA_INTERVAL_OPTIONS,
  APPOINTMENT_DURATION_OPTIONS,
  NOTIFICATION_ITEMS,
  SETTINGS_DEFAULTS,
  TIME_FORMAT_OPTIONS,
  type AgendaIntervalMinutes,
  type AppointmentDurationMinutes,
  type NotificationKey,
  type TimeFormat,
} from "./mock-data";

// Configuración — Clinic Admin only (see nav-items.ts / role.ts). Agenda
// defaults, appointment-notification toggles, and regional preferences —
// UI/UX only, local mock state, nothing persisted, no backend (see task
// scope). Does not duplicate clinic identity/team/subscription/billing,
// which already live in their own screens (Clínica, Mi Suscripción).
export function SettingsScreen() {
  const [appointmentDuration, setAppointmentDuration] = useState<AppointmentDurationMinutes>(
    SETTINGS_DEFAULTS.appointmentDuration,
  );
  const [agendaInterval, setAgendaInterval] = useState<AgendaIntervalMinutes>(SETTINGS_DEFAULTS.agendaInterval);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(SETTINGS_DEFAULTS.timeFormat);
  const [notifications, setNotifications] = useState(SETTINGS_DEFAULTS.notifications);

  const toggleNotification = (key: NotificationKey) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">
        Preferencias operativas y regionales de tu clínica.
      </p>

      {/* Single column on mobile/tablet; desktop lays the three sections
          out in one even row (see task scope), same lg: breakpoint/grid
          approach as Mi Suscripción. Grid's default item stretch keeps the
          three cards the same height without a rigid fixed height that
          would clip longer content. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3">
        <AgendaSection
          appointmentDuration={appointmentDuration}
          onAppointmentDurationChange={setAppointmentDuration}
          agendaInterval={agendaInterval}
          onAgendaIntervalChange={setAgendaInterval}
        />

        <NotificationsSection notifications={notifications} onToggle={toggleNotification} />

        <RegionalSection timeFormat={timeFormat} onTimeFormatChange={setTimeFormat} />
      </div>

      {/* Second row, full width — Ausencias applies to any dentist in the
          clinic, not just one of the three settings above, so it doesn't
          share the 3-column row (see task scope). */}
      <AusenciasAdminSection />
    </div>
  );
}

function AgendaSection({
  appointmentDuration,
  onAppointmentDurationChange,
  agendaInterval,
  onAgendaIntervalChange,
}: {
  appointmentDuration: AppointmentDurationMinutes;
  onAppointmentDurationChange: (value: AppointmentDurationMinutes) => void;
  agendaInterval: AgendaIntervalMinutes;
  onAgendaIntervalChange: (value: AgendaIntervalMinutes) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CalendarIcon className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Agenda y citas</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Preferencias operativas globales de tu agenda.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-label-foreground">Duración predeterminada de cita</label>
          <select
            value={appointmentDuration}
            onChange={(e) => onAppointmentDurationChange(Number(e.target.value) as AppointmentDurationMinutes)}
            className={`${FIELD_CLASS} mt-1.5`}
          >
            {APPOINTMENT_DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-label-foreground">Intervalo de agenda</label>
          <select
            value={agendaInterval}
            onChange={(e) => onAgendaIntervalChange(Number(e.target.value) as AgendaIntervalMinutes)}
            className={`${FIELD_CLASS} mt-1.5`}
          >
            {AGENDA_INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function NotificationsSection({
  notifications,
  onToggle,
}: {
  notifications: Record<NotificationKey, boolean>;
  onToggle: (key: NotificationKey) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BellIcon className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Notificaciones de citas</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Activa o desactiva los avisos automáticos a tus pacientes.
          </p>
        </div>
      </div>

      <div className="mt-3 divide-y divide-border">
        {NOTIFICATION_ITEMS.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
            </div>
            <ToggleSwitch label={item.label} checked={notifications[item.key]} onChange={() => onToggle(item.key)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ToggleSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-foreground/15"
      }`}
    >
      <span
        className={`inline-block size-4 transform rounded-full bg-background shadow-sm transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function RegionalSection({
  timeFormat,
  onTimeFormatChange,
}: {
  timeFormat: TimeFormat;
  onTimeFormatChange: (value: TimeFormat) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MapPinIcon className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Preferencias regionales</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Aplican a la agenda y las notificaciones de tu clínica.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-label-foreground">Zona horaria</label>
          {/* Single fixed timezone for now (MVP) — shown as a disabled
              select so it reads visually consistent with the real controls
              on this screen instead of inventing a separate static style. */}
          <select
            value="america-bogota"
            disabled
            className={`${FIELD_CLASS} mt-1.5 cursor-not-allowed text-muted-foreground`}
          >
            <option value="america-bogota">{SETTINGS_DEFAULTS.timezoneLabel}</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-label-foreground">Formato de hora</label>
          <select
            value={timeFormat}
            onChange={(e) => onTimeFormatChange(e.target.value as TimeFormat)}
            className={`${FIELD_CLASS} mt-1.5`}
          >
            {TIME_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
