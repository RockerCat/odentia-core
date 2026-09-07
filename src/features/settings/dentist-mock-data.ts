// Odontólogo > Configuración — mock-only data. Ausencias/Horario moved to
// real persistence (see absences-data.ts/availability-data.ts,
// professional_absences/professional_availability) — only the
// notification preferences below remain UI/UX-only, nothing persisted, no
// backend (out of this task's own scope — see "no tocar notificaciones").

export type DentistNotificationKey =
  | "newAppointments"
  | "rescheduledOrCancelled"
  | "patientArrived"
  | "agendaChanges";

export const DENTIST_NOTIFICATION_ITEMS: { key: DentistNotificationKey; label: string; description: string }[] = [
  {
    key: "newAppointments",
    label: "Nuevas citas asignadas",
    description: "Te avisamos cuando se agenda una nueva cita contigo.",
  },
  {
    key: "rescheduledOrCancelled",
    label: "Citas reprogramadas o canceladas",
    description: "Te avisamos cuando una de tus citas cambia de fecha o se cancela.",
  },
  {
    key: "patientArrived",
    label: "Paciente llegó / sala de espera",
    description: "Te avisamos cuando un paciente llega y queda en sala de espera.",
  },
  {
    key: "agendaChanges",
    label: "Cambios importantes en mi agenda",
    description: "Te avisamos ante otros cambios relevantes en tu agenda.",
  },
];

export const DENTIST_NOTIFICATION_DEFAULTS: Record<DentistNotificationKey, boolean> = {
  newAppointments: true,
  rescheduledOrCancelled: true,
  patientArrived: true,
  agendaChanges: false,
};
