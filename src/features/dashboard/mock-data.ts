import { CalendarIcon, CheckCircleIcon, ClockIcon, UsersIcon } from "@/components/shell/icons";

export type Dentist = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  photoUrl?: string;
};

// Only practicing dentists belong here — the Agenda's columns come
// straight from this list. The logged-in Clinic Admin (see
// src/lib/current-user.ts) is deliberately NOT one of these entries: she's
// a pure administrator in this scenario and must not appear as a column.
export const DENTISTS: Dentist[] = [
  { id: "d1", name: "Dra. Camila Vargas", initials: "CV", specialty: "Odontología general" },
  { id: "d2", name: "Dr. Julián Restrepo", initials: "JR", specialty: "Ortodoncia" },
  { id: "d3", name: "Dra. Paula Escobar", initials: "PE", specialty: "Endodoncia" },
];

export type AppointmentStatus =
  | "confirmed"
  | "pending"
  | "in-progress"
  | "completed"
  | "cancelled";

export type WeekDay = {
  key: string;
  label: string;
  shortLabel: string;
  dateNumber: string;
  dateLabel: string;
  isToday: boolean;
};

// Static display data only — no date logic yet, per this iteration's scope.
export const CURRENT_WEEK_LABEL = "3 – 9 Agosto 2026";

export const WEEK_DAYS: WeekDay[] = [
  { key: "monday", label: "Lunes", shortLabel: "Lun", dateNumber: "3", dateLabel: "3 Ago", isToday: false },
  { key: "tuesday", label: "Martes", shortLabel: "Mar", dateNumber: "4", dateLabel: "4 Ago", isToday: false },
  { key: "wednesday", label: "Miércoles", shortLabel: "Mié", dateNumber: "5", dateLabel: "5 Ago", isToday: true },
  { key: "thursday", label: "Jueves", shortLabel: "Jue", dateNumber: "6", dateLabel: "6 Ago", isToday: false },
  { key: "friday", label: "Viernes", shortLabel: "Vie", dateNumber: "7", dateLabel: "7 Ago", isToday: false },
  { key: "saturday", label: "Sábado", shortLabel: "Sáb", dateNumber: "8", dateLabel: "8 Ago", isToday: false },
  { key: "sunday", label: "Domingo", shortLabel: "Dom", dateNumber: "9", dateLabel: "9 Ago", isToday: false },
];

export type Appointment = {
  id: string;
  day: string;
  time: string;
  patientName: string;
  initials: string;
  type: string;
  status: AppointmentStatus;
  dentistId: string;
};

// Wednesday (today) intentionally keeps the exact same 8 appointments and
// status mix as before — TODAY_SUMMARY's KPI values are derived from them.
// Two times were nudged onto the 30-min slot grid (10:15→10:00, 11:45→11:30).
export const WEEK_APPOINTMENTS: Appointment[] = [
  // Monday — past day, resolved
  { id: "m1", day: "monday", time: "9:00 AM", patientName: "Camilo Ríos", initials: "CR", type: "Limpieza dental", status: "completed", dentistId: "d1" },
  { id: "m2", day: "monday", time: "11:30 AM", patientName: "Isabella Fonseca", initials: "IF", type: "Chequeo general", status: "completed", dentistId: "d1" },
  { id: "m3", day: "monday", time: "10:00 AM", patientName: "Mateo Salazar", initials: "MS", type: "Extracción dental", status: "completed", dentistId: "d2" },
  { id: "m4", day: "monday", time: "3:00 PM", patientName: "Daniela Ochoa", initials: "DO", type: "Control de ortodoncia", status: "cancelled", dentistId: "d2" },
  { id: "m5", day: "monday", time: "2:00 PM", patientName: "Santiago Peña", initials: "SP", type: "Primera consulta", status: "completed", dentistId: "d3" },

  // Tuesday — past day, resolved
  { id: "t1", day: "tuesday", time: "8:30 AM", patientName: "Valeria Muñoz", initials: "VM", type: "Blanqueamiento dental", status: "completed", dentistId: "d1" },
  { id: "t2", day: "tuesday", time: "9:30 AM", patientName: "Nicolás Castaño", initials: "NC", type: "Limpieza dental", status: "completed", dentistId: "d2" },
  { id: "t3", day: "tuesday", time: "1:00 PM", patientName: "Gabriela Duarte", initials: "GD", type: "Consulta de ortodoncia", status: "completed", dentistId: "d2" },
  { id: "t4", day: "tuesday", time: "10:00 AM", patientName: "Sebastián Lara", initials: "SL", type: "Chequeo general", status: "completed", dentistId: "d3" },
  { id: "t5", day: "tuesday", time: "4:00 PM", patientName: "Manuela Rincón", initials: "MR", type: "Tratamiento de conductos", status: "completed", dentistId: "d3" },

  // Wednesday — today, unchanged from the daily view
  { id: "1", day: "wednesday", time: "8:00 AM", patientName: "María Gómez", initials: "MG", type: "Limpieza dental", status: "confirmed", dentistId: "d1" },
  { id: "2", day: "wednesday", time: "9:00 AM", patientName: "Carlos Rodríguez", initials: "CR", type: "Chequeo general", status: "completed", dentistId: "d2" },
  { id: "3", day: "wednesday", time: "9:30 AM", patientName: "Laura Martínez", initials: "LM", type: "Consulta de ortodoncia", status: "in-progress", dentistId: "d3" },
  { id: "4", day: "wednesday", time: "10:00 AM", patientName: "Andrés Torres", initials: "AT", type: "Extracción dental", status: "pending", dentistId: "d1" },
  { id: "5", day: "wednesday", time: "11:00 AM", patientName: "Sofía Ramírez", initials: "SR", type: "Blanqueamiento dental", status: "confirmed", dentistId: "d2" },
  { id: "6", day: "wednesday", time: "11:30 AM", patientName: "Jorge Herrera", initials: "JH", type: "Tratamiento de conductos", status: "cancelled", dentistId: "d3" },
  { id: "7", day: "wednesday", time: "2:00 PM", patientName: "Valentina Cruz", initials: "VC", type: "Primera consulta", status: "pending", dentistId: "d1" },
  { id: "8", day: "wednesday", time: "3:30 PM", patientName: "Diego Morales", initials: "DM", type: "Control de ortodoncia", status: "confirmed", dentistId: "d2" },

  // Thursday — upcoming
  { id: "j1", day: "thursday", time: "9:00 AM", patientName: "Emilio Cárdenas", initials: "EC", type: "Limpieza dental", status: "confirmed", dentistId: "d1" },
  { id: "j2", day: "thursday", time: "2:30 PM", patientName: "Antonia Bermúdez", initials: "AB", type: "Chequeo general", status: "pending", dentistId: "d1" },
  { id: "j3", day: "thursday", time: "10:30 AM", patientName: "Camilo Ríos", initials: "CR", type: "Control de ortodoncia", status: "confirmed", dentistId: "d2" },
  { id: "j4", day: "thursday", time: "11:00 AM", patientName: "Isabella Fonseca", initials: "IF", type: "Extracción dental", status: "confirmed", dentistId: "d3" },
  { id: "j5", day: "thursday", time: "3:00 PM", patientName: "Mateo Salazar", initials: "MS", type: "Primera consulta", status: "pending", dentistId: "d3" },

  // Friday — upcoming
  { id: "v1", day: "friday", time: "8:00 AM", patientName: "Daniela Ochoa", initials: "DO", type: "Blanqueamiento dental", status: "confirmed", dentistId: "d1" },
  { id: "v2", day: "friday", time: "1:30 PM", patientName: "Santiago Peña", initials: "SP", type: "Limpieza dental", status: "confirmed", dentistId: "d1" },
  { id: "v3", day: "friday", time: "9:00 AM", patientName: "Valeria Muñoz", initials: "VM", type: "Tratamiento de conductos", status: "confirmed", dentistId: "d2" },
  { id: "v4", day: "friday", time: "11:00 AM", patientName: "Nicolás Castaño", initials: "NC", type: "Chequeo general", status: "cancelled", dentistId: "d2" },
  { id: "v5", day: "friday", time: "3:30 PM", patientName: "Gabriela Duarte", initials: "GD", type: "Consulta de ortodoncia", status: "pending", dentistId: "d3" },

  // Saturday — light day
  { id: "s1", day: "saturday", time: "9:00 AM", patientName: "Sebastián Lara", initials: "SL", type: "Limpieza dental", status: "confirmed", dentistId: "d1" },

  // Sunday — closed, no appointments
];

export type SummaryMetric = {
  label: string;
  value: string;
  subtitle: string;
  icon: typeof CalendarIcon;
};

export const TODAY_SUMMARY: SummaryMetric[] = [
  { label: "Citas hoy", value: "8", subtitle: "Total programadas", icon: CalendarIcon },
  { label: "Confirmadas", value: "3", subtitle: "37.5% del total", icon: CheckCircleIcon },
  { label: "Pendientes de confirmar", value: "2", subtitle: "25% del total", icon: ClockIcon },
  { label: "Nuevos pacientes este mes", value: "14", subtitle: "↑ 27% vs. mes anterior", icon: UsersIcon },
];

export type OperationalAlert = {
  id: string;
  message: string;
  description?: string;
  tone: "warning" | "info" | "primary";
};

export const OPERATIONAL_ALERTS: OperationalAlert[] = [
  { id: "1", message: "2 citas están esperando confirmación.", tone: "warning" },
  { id: "2", message: "1 historia clínica requiere información.", tone: "info" },
  {
    id: "3",
    message: "Tu prueba termina en 5 días.",
    description: "Actualiza tu plan para mantener acceso completo.",
    tone: "primary",
  },
];
