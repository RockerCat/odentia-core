import { ADMIN_DENTIST_ID } from "@/features/dashboard/mock-data";

// Odontólogo > Configuración — mock-only data. Ausencias are temporary
// exceptions to the dentist's regular availability (which continues to be
// managed from their profile, see task scope) — nothing persisted, no
// backend.

export type Absence = {
  id: string;
  reason: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string; // ISO yyyy-mm-dd
  allDay: boolean;
  startTime?: string; // HH:mm, only when !allDay
  endTime?: string; // HH:mm, only when !allDay
};

export const ABSENCES_MOCK: Absence[] = [
  {
    id: "absence-1",
    reason: "Vacaciones",
    startDate: "2026-09-15",
    endDate: "2026-09-22",
    allDay: true,
  },
  {
    id: "absence-2",
    reason: "Asunto personal",
    startDate: "2026-10-03",
    endDate: "2026-10-03",
    allDay: false,
    startTime: "09:00",
    endTime: "12:00",
  },
  {
    id: "absence-3",
    reason: "Congreso odontológico",
    startDate: "2026-11-10",
    endDate: "2026-11-12",
    allDay: true,
  },
];

// Per-dentist Ausencias for the Clinic Admin's own Configuración screen
// (she manages any dentist's absences, not just her own — see
// ausencias-admin-section.tsx). d1's list mirrors ABSENCES_MOCK above (the
// Odontólogo role's own dev session is always Dra. Camila Vargas / "d1",
// see DEV_DENTIST_ID) so both views agree on her absences.
export const ABSENCES_BY_DENTIST: Record<string, Absence[]> = {
  d1: ABSENCES_MOCK,
  d2: [
    {
      id: "absence-d2-1",
      reason: "Cita médica",
      startDate: "2026-09-05",
      endDate: "2026-09-05",
      allDay: false,
      startTime: "14:00",
      endTime: "16:00",
    },
  ],
  d3: [],
  // "Administrador Odontólogo Único" (see role-context.tsx) — her own
  // ausencias when she's the clinic's only dentist.
  [ADMIN_DENTIST_ID]: [
    {
      id: "absence-admin-self-1",
      reason: "Vacaciones",
      startDate: "2026-09-15",
      endDate: "2026-09-19",
      allDay: true,
    },
  ],
};

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
