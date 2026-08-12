import { chronologicalKey } from "@/features/dashboard/appointment-detail-modal";
import type { Appointment, AppointmentStatus, WeekDay } from "@/features/dashboard/mock-data";

// Patients aren't a first-class entity in the Agenda's own mocks (see
// appointment-detail-modal.tsx's getPatientHistory comment) — this module
// adds that entity for the Pacientes screen, but keeps every patient's name
// matched against WEEK_APPOINTMENTS so "última atención"/"próxima cita" stay
// coherent with what Agenda already shows instead of duplicating separate,
// driftable dates.

export type PatientStatus = "active" | "inactive";

export type Patient = {
  id: string;
  name: string;
  initials: string;
  age: number;
  phone: string;
  email: string;
  documentId: string;
  patientSinceLabel: string;
  isNewThisMonth: boolean;
  usualDentistId: string;
  allergies?: string;
  status: PatientStatus;
  // Only set for patients with no appointment in the current mock week —
  // gives "Sin atención +6 meses" real mock coverage without inventing
  // stale entries in WEEK_APPOINTMENTS. Ignored whenever a real matching
  // appointment exists.
  fallbackLastVisitLabel?: string;
  noRecentVisit?: boolean;
};

export const PATIENT_STATUS_LABELS: Record<PatientStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
};

export const PATIENTS: Patient[] = [
  {
    id: "p1",
    name: "María Gómez",
    initials: "MG",
    age: 34,
    phone: "+57 300 452 1189",
    email: "maria.gomez.paciente@gmail.com",
    documentId: "CC 52.334.981",
    patientSinceLabel: "Ene 2023",
    isNewThisMonth: false,
    usualDentistId: "d1",
    status: "active",
  },
  {
    id: "p2",
    name: "Carlos Rodríguez",
    initials: "CR",
    age: 41,
    phone: "+57 301 998 2234",
    email: "carlos.rodriguez@hotmail.com",
    documentId: "CC 79.221.456",
    patientSinceLabel: "Mar 2024",
    isNewThisMonth: false,
    usualDentistId: "d2",
    status: "active",
  },
  {
    id: "p3",
    name: "Laura Martínez",
    initials: "LM",
    age: 27,
    phone: "+57 315 667 0091",
    email: "laura.martinez27@gmail.com",
    documentId: "CC 1.019.887.213",
    patientSinceLabel: "Jun 2022",
    isNewThisMonth: false,
    usualDentistId: "d3",
    allergies: "Alergia a la lidocaína",
    status: "active",
  },
  {
    id: "p4",
    name: "Andrés Torres",
    initials: "AT",
    age: 52,
    phone: "+57 300 778 2201",
    email: "andres.torres@yahoo.com",
    documentId: "CC 19.887.320",
    patientSinceLabel: "Ago 2026",
    isNewThisMonth: true,
    usualDentistId: "d1",
    // Matches the note already on this patient's appointment in
    // mock-data.ts (id "4") — kept in sync on purpose.
    allergies: "Alergia a la penicilina",
    status: "active",
  },
  {
    id: "p5",
    name: "Sofía Ramírez",
    initials: "SR",
    age: 23,
    phone: "+57 302 774 5566",
    email: "sofia.ramirez23@gmail.com",
    documentId: "CC 1.022.456.789",
    patientSinceLabel: "Jul 2026",
    isNewThisMonth: false,
    usualDentistId: "d2",
    status: "active",
  },
  {
    id: "p6",
    name: "Camilo Ríos",
    initials: "CR",
    age: 38,
    phone: "+57 311 456 7890",
    email: "camilo.rios@gmail.com",
    documentId: "CC 80.334.112",
    patientSinceLabel: "Feb 2021",
    isNewThisMonth: false,
    usualDentistId: "d1",
    status: "active",
  },
  {
    id: "p7",
    name: "Isabella Fonseca",
    initials: "IF",
    age: 19,
    phone: "+57 320 887 4432",
    email: "isabella.fonseca@gmail.com",
    documentId: "CC 1.030.998.221",
    patientSinceLabel: "Sep 2023",
    isNewThisMonth: false,
    usualDentistId: "d1",
    status: "active",
  },
  {
    id: "p8",
    name: "Mateo Salazar",
    initials: "MS",
    age: 45,
    phone: "+57 313 220 6690",
    email: "mateo.salazar@outlook.com",
    documentId: "CC 71.334.882",
    patientSinceLabel: "Ago 2026",
    isNewThisMonth: true,
    usualDentistId: "d2",
    status: "active",
  },
  {
    id: "p9",
    name: "Daniela Ochoa",
    initials: "DO",
    age: 31,
    phone: "+57 304 556 7781",
    email: "daniela.ochoa@gmail.com",
    documentId: "CC 1.015.667.334",
    patientSinceLabel: "Dic 2022",
    isNewThisMonth: false,
    usualDentistId: "d1",
    status: "active",
  },
  {
    id: "p10",
    name: "Santiago Peña",
    initials: "SP",
    age: 29,
    phone: "+57 316 998 2231",
    email: "santiago.pena@gmail.com",
    documentId: "CC 1.024.556.780",
    patientSinceLabel: "Abr 2024",
    isNewThisMonth: false,
    usualDentistId: "d3",
    status: "active",
  },
  {
    id: "p11",
    name: "Valeria Muñoz",
    initials: "VM",
    age: 26,
    phone: "+57 300 887 6612",
    email: "valeria.munoz@gmail.com",
    documentId: "CC 1.018.334.552",
    patientSinceLabel: "Ene 2025",
    isNewThisMonth: false,
    usualDentistId: "d1",
    status: "active",
  },
  {
    id: "p12",
    name: "Sebastián Lara",
    initials: "SL",
    age: 48,
    phone: "+57 312 445 9987",
    email: "sebastian.lara@hotmail.com",
    documentId: "CC 79.556.221",
    patientSinceLabel: "May 2023",
    isNewThisMonth: false,
    usualDentistId: "d3",
    status: "active",
  },
  {
    id: "p13",
    name: "Ricardo Peláez",
    initials: "RP",
    age: 56,
    phone: "+57 301 223 4487",
    email: "ricardo.pelaez@gmail.com",
    documentId: "CC 70.221.998",
    patientSinceLabel: "Nov 2020",
    isNewThisMonth: false,
    usualDentistId: "d2",
    status: "inactive",
    fallbackLastVisitLabel: "Hace 8 meses",
    noRecentVisit: true,
  },
  {
    id: "p14",
    name: "Lucía Fernández",
    initials: "LF",
    age: 33,
    phone: "+57 305 667 1123",
    email: "lucia.fernandez@gmail.com",
    documentId: "CC 1.012.887.556",
    patientSinceLabel: "Jul 2020",
    isNewThisMonth: false,
    usualDentistId: "d3",
    status: "inactive",
    fallbackLastVisitLabel: "Hace 11 meses",
    noRecentVisit: true,
  },
];

const RESOLVED_STATUSES: AppointmentStatus[] = ["completed", "no-show", "cancelled"];
const UPCOMING_STATUSES: AppointmentStatus[] = ["confirmed", "pending", "in-progress"];

export type PatientVisitSummary = {
  lastVisit: Appointment | null;
  lastVisitLabel: string;
  nextAppointment: Appointment | null;
  nextAppointmentLabel: string;
};

// Derives "última atención"/"próxima cita" from the same WEEK_APPOINTMENTS
// Agenda already uses, matched by patient name (same approach as
// getPatientHistory/derivePatientOptions elsewhere in the dashboard
// feature) — keeps these dates from ever drifting out of sync with Agenda.
export function getPatientVisitSummary(
  patient: Patient,
  appointments: Appointment[],
  weekDays: WeekDay[],
): PatientVisitSummary {
  const own = appointments.filter((a) => a.patientName === patient.name);

  const resolved = own
    .filter((a) => RESOLVED_STATUSES.includes(a.status))
    .sort((a, b) => chronologicalKey(b, weekDays) - chronologicalKey(a, weekDays));
  const upcoming = own
    .filter((a) => UPCOMING_STATUSES.includes(a.status))
    .sort((a, b) => chronologicalKey(a, weekDays) - chronologicalKey(b, weekDays));

  const lastVisit = resolved[0] ?? null;
  const nextAppointment = upcoming[0] ?? null;

  const dayLabel = (appt: Appointment) => weekDays.find((d) => d.key === appt.day)?.label ?? appt.day;

  return {
    lastVisit,
    lastVisitLabel: lastVisit
      ? `${dayLabel(lastVisit)}, ${lastVisit.time} · ${lastVisit.type ?? "Consulta"}`
      : (patient.fallbackLastVisitLabel ?? "Sin atenciones recientes"),
    nextAppointment,
    nextAppointmentLabel: nextAppointment
      ? `${dayLabel(nextAppointment)}, ${nextAppointment.time} · ${nextAppointment.type ?? "Consulta"}`
      : "Sin cita programada",
  };
}
