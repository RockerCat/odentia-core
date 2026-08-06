import { BellIcon, CalendarIcon, CheckCircleIcon, ClockIcon } from "@/components/shell/icons";

export type Dentist = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  avatar_url?: string;
};

// Only practicing dentists belong here — the Agenda's columns come
// straight from this list. The logged-in Clinic Admin (see
// src/lib/current-user.ts) is deliberately NOT one of these entries: she's
// a pure administrator in this scenario and must not appear as a column.
// avatar_url values are temporary placeholder headshots for development
// only — swap for real profile photo URLs once the backend integration
// exists. UserAvatar itself falls back to initials if a photo is missing
// or fails to load.
export const DENTISTS: Dentist[] = [
  {
    id: "d1",
    name: "Dra. Camila Vargas",
    initials: "CV",
    specialty: "Odontología general",
    avatar_url: "https://randomuser.me/api/portraits/women/44.jpg",
  },
  {
    id: "d2",
    name: "Dr. Julián Restrepo",
    initials: "JR",
    specialty: "Ortodoncia",
    avatar_url: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    id: "d3",
    name: "Dra. Paula Escobar",
    initials: "PE",
    specialty: "Endodoncia",
    avatar_url: "https://randomuser.me/api/portraits/women/65.jpg",
  },
];

export type AppointmentStatus =
  | "confirmed"
  | "pending"
  | "in-progress"
  | "completed"
  | "cancelled"
  | "no-show";

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: "Confirmada",
  pending: "Pendiente",
  "in-progress": "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
  "no-show": "No asistió",
};

export const STATUS_STYLES: Record<AppointmentStatus, string> = {
  confirmed: "border-success/25 bg-success/10 text-success",
  pending: "border-warning/25 bg-warning/10 text-warning",
  "in-progress": "border-info/25 bg-info/10 text-info",
  cancelled: "border-danger/20 bg-danger/5 text-danger/70",
  completed: "border-border bg-foreground/[0.03] text-muted-foreground",
  "no-show": "border-noshow/25 bg-noshow/10 text-noshow",
};

// The patient-history timeline's badge reads as an outcome log (was this
// visit resolved well or not?) rather than a live schedule, so it uses its
// own status→color mapping instead of STATUS_STYLES above: Completada is
// the "good" green outcome, Cancelada fades to neutral gray, etc. The
// timeline's dots are deliberately kept neutral gray, not status-colored
// (see HistoryEntry in appointment-detail-modal.tsx) — the badge is the
// only status color cue there. Everywhere else (the header badge, the
// agenda grid, "Cambiar estado") keeps STATUS_STYLES.
export const HISTORY_STATUS_BADGE_CLASS: Record<AppointmentStatus, string> = {
  completed: "border-success/25 bg-success/10 text-success",
  confirmed: "border-info/25 bg-info/10 text-info",
  pending: "border-warning/25 bg-warning/10 text-warning",
  "no-show": "border-noshow/25 bg-noshow/10 text-noshow",
  cancelled: "border-border bg-foreground/[0.04] text-muted-foreground",
  "in-progress": "border-info/25 bg-info/10 text-info",
};

// Rooms and treatments are small fixed catalogs for this prototype phase —
// real clinic-configurable versions come with the backend.
export const ROOMS = ["Consultorio 1", "Consultorio 2", "Consultorio 3"];

export const TREATMENT_OPTIONS = [
  "Primera consulta",
  "Chequeo general",
  "Limpieza dental",
  "Blanqueamiento dental",
  "Extracción dental",
  "Tratamiento de conductos",
  "Consulta de ortodoncia",
  "Control de ortodoncia",
];

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
  type?: string; // planned treatment — absent when none has been set yet
  status: AppointmentStatus;
  dentistId: string;
  durationMinutes?: number; // defaults to the clinic's slot interval when absent
  room?: string;
  patientPhone?: string;
  notes?: string;
};

// TEMPORARY — stands in for a patient's real appointment history so the
// timeline's design/UX can be validated before that data exists (see
// AppointmentDetailModal, which falls back to this only when a patient has
// no real computed history). `day` holds a full pre-formatted date on
// purpose: these dates fall outside the single demo week in WEEK_DAYS, and
// the timeline already falls back to displaying `day` verbatim whenever it
// can't match a WeekDay key, so no rendering code needs to change for this
// mock. `patientName` is unused by the timeline (the modal header already
// names the patient) and is only here to satisfy the Appointment type.
// DELETE this block and its one-line fallback in AppointmentDetailModal
// once real historical data is wired up — nothing else references it.
export const MOCK_PATIENT_HISTORY: Appointment[] = [
  {
    id: "mock-h1",
    day: "6 Jul 2026",
    time: "8:00 AM",
    patientName: "Paciente de ejemplo",
    initials: "PE",
    type: "Limpieza dental",
    status: "completed",
    dentistId: "d1",
    notes: "Paciente sin novedades. Se realizó profilaxis y limpieza general.",
  },
  {
    id: "mock-h2",
    day: "8 Jun 2026",
    time: "8:00 AM",
    patientName: "Paciente de ejemplo",
    initials: "PE",
    type: "Blanqueamiento dental",
    status: "completed",
    dentistId: "d1",
    notes: "Primera sesión de blanqueamiento. Buena respuesta al tratamiento.",
  },
  {
    id: "mock-h3",
    day: "11 May 2026",
    time: "8:30 AM",
    patientName: "Paciente de ejemplo",
    initials: "PE",
    type: "Resina compuesta",
    status: "completed",
    dentistId: "d1",
    notes: "Restauración en OD 1.6 realizada sin complicaciones.",
  },
  {
    id: "mock-h4",
    day: "13 Abr 2026",
    time: "9:00 AM",
    patientName: "Paciente de ejemplo",
    initials: "PE",
    type: "Control general",
    status: "no-show",
    dentistId: "d1",
  },
  {
    id: "mock-h5",
    day: "9 Mar 2026",
    time: "8:00 AM",
    patientName: "Paciente de ejemplo",
    initials: "PE",
    type: "Limpieza dental",
    status: "cancelled",
    dentistId: "d1",
  },
];

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
  { id: "t6", day: "tuesday", time: "11:00 AM", patientName: "Camilo Ríos", initials: "CR", type: "Chequeo general", status: "no-show", dentistId: "d1" },

  // Wednesday — today, unchanged from the daily view. Deliberately mixed
  // coverage of the optional fields (room/phone/notes/duration) so every
  // "if present" branch in the detail modal gets exercised.
  { id: "1", day: "wednesday", time: "8:00 AM", patientName: "María Gómez", initials: "MG", type: "Limpieza dental", status: "confirmed", dentistId: "d1", room: "Consultorio 1", patientPhone: "+57 300 452 1189" },
  { id: "2", day: "wednesday", time: "9:00 AM", patientName: "Carlos Rodríguez", initials: "CR", type: "Chequeo general", status: "completed", dentistId: "d2", room: "Consultorio 2", patientPhone: "+57 301 998 2234" },
  { id: "3", day: "wednesday", time: "9:30 AM", patientName: "Laura Martínez", initials: "LM", type: "Consulta de ortodoncia", status: "in-progress", dentistId: "d3", patientPhone: "+57 315 667 0091", notes: "Prefiere citas en la mañana." },
  { id: "4", day: "wednesday", time: "10:00 AM", patientName: "Andrés Torres", initials: "AT", type: "Extracción dental", status: "pending", dentistId: "d1", durationMinutes: 45, room: "Consultorio 1", notes: "Alergia a la penicilina." },
  { id: "5", day: "wednesday", time: "11:00 AM", patientName: "Sofía Ramírez", initials: "SR", type: "Blanqueamiento dental", status: "confirmed", dentistId: "d2", room: "Consultorio 2", patientPhone: "+57 302 774 5566" },
  { id: "6", day: "wednesday", time: "11:30 AM", patientName: "Jorge Herrera", initials: "JH", type: "Tratamiento de conductos", status: "cancelled", dentistId: "d3", durationMinutes: 60, room: "Consultorio 3", patientPhone: "+57 300 112 8843", notes: "Canceló por motivos laborales." },
  { id: "7", day: "wednesday", time: "2:00 PM", patientName: "Valentina Cruz", initials: "VC", type: "Primera consulta", status: "pending", dentistId: "d1" },
  { id: "8", day: "wednesday", time: "3:30 PM", patientName: "Diego Morales", initials: "DM", type: "Control de ortodoncia", status: "confirmed", dentistId: "d2", room: "Consultorio 2", patientPhone: "+57 304 221 9087" },

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

export type SummaryMetric = {
  label: string;
  value: string;
  subtitle: string;
  icon: typeof CalendarIcon;
};

// The 4th KPI's value is derived from OPERATIONAL_ALERTS.length rather
// than hardcoded, so it can't silently drift out of sync with the actual
// alert count.
export const TODAY_SUMMARY: SummaryMetric[] = [
  { label: "Citas hoy", value: "8", subtitle: "Total programadas", icon: CalendarIcon },
  { label: "Confirmadas", value: "3", subtitle: "37.5% del total", icon: CheckCircleIcon },
  { label: "Pendientes de confirmar", value: "2", subtitle: "25% del total", icon: ClockIcon },
  {
    label: "Alertas",
    value: String(OPERATIONAL_ALERTS.length),
    subtitle: "Requieren atención",
    icon: BellIcon,
  },
];
