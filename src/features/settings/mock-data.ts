// Configuración — Clinic Admin only. Mock-only preferences: nothing
// persisted, no backend (see task scope).

export type AppointmentDurationMinutes = 30 | 45 | 60;
export type AgendaIntervalMinutes = 15 | 30 | 60;
export type TimeFormat = "12h" | "24h";
export type NotificationKey = "reminders" | "confirmations" | "rescheduleAndCancellation";

export const APPOINTMENT_DURATION_OPTIONS: { value: AppointmentDurationMinutes; label: string }[] = [
  { value: 30, label: "30 minutos" },
  { value: 45, label: "45 minutos" },
  { value: 60, label: "60 minutos" },
];

export const AGENDA_INTERVAL_OPTIONS: { value: AgendaIntervalMinutes; label: string }[] = [
  { value: 15, label: "Cada 15 minutos" },
  { value: 30, label: "Cada 30 minutos" },
  { value: 60, label: "Cada 60 minutos" },
];

export const TIME_FORMAT_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: "12h", label: "12 horas" },
  { value: "24h", label: "24 horas" },
];

export const NOTIFICATION_ITEMS: { key: NotificationKey; label: string; description: string }[] = [
  {
    key: "reminders",
    label: "Recordatorios de citas",
    description: "Envía un aviso al paciente antes de su cita programada.",
  },
  {
    key: "confirmations",
    label: "Confirmaciones de citas",
    description: "Solicita al paciente confirmar su asistencia a la cita.",
  },
  {
    key: "rescheduleAndCancellation",
    label: "Avisos de reprogramación y cancelación",
    description: "Notifica al paciente cuando una cita cambia de fecha o se cancela.",
  },
];

export const SETTINGS_DEFAULTS = {
  appointmentDuration: 30 as AppointmentDurationMinutes,
  agendaInterval: 15 as AgendaIntervalMinutes,
  timeFormat: "12h" as TimeFormat,
  timezoneLabel: "America/Bogotá (Colombia)",
  notifications: {
    reminders: true,
    confirmations: true,
    rescheduleAndCancellation: true,
  } satisfies Record<NotificationKey, boolean>,
};
