import { chronologicalKey, type Appointment, type AppointmentStatus, type WeekDay } from "@/features/dashboard/mock-data";
import type { OdontogramData } from "@/features/dashboard/odontogram-teeth";

// Patients aren't a first-class entity in the Agenda's own mocks (see
// appointment-detail-modal.tsx's getPatientHistory comment) — this module
// adds that entity for the Pacientes screen, but keeps every patient's name
// matched against WEEK_APPOINTMENTS so "última atención"/"próxima cita" stay
// coherent with what Agenda already shows instead of duplicating separate,
// driftable dates.

export type PatientStatus = "active" | "inactive";

// Historia Clínica (Clinic Admin, see clinical-record-screen.tsx) —
// structured "Antecedentes" tab content.
export type Anamnesis = {
  personalHistory?: string;
  familyHistory?: string;
  habits?: string;
  surgicalHistory?: string; // Cirugías / hospitalizaciones
  pregnancy?: string; // Embarazo — only set when actually applicable
  otherRelevant?: string;
  // Short, deliberately distinct wording from the fuller fields above —
  // these back "Condiciones y factores relevantes"'s KPI cards, so that
  // section never just repeats the same paragraph the Anamnesis grid
  // already shows (see AntecedentesTab's own comment).
  habitsSummary?: string;
  oralHygieneSummary?: string;
  familyHistorySummary?: string;
  updatedLabel: string;
  updatedByDentistId: string;
};

// Historia Clínica's "Atenciones" tab — deliberately its own record, not
// reused straight off Appointment: an appointment's own `notes` is a
// scheduling note (see e.g. "Prefiere citas en la mañana."), not a clinical
// finding, and this tab needs the latter. `status` reuses AppointmentStatus
// purely so this can share STATUS_LABELS/HISTORY_STATUS_BADGE_CLASS instead
// of a second status vocabulary.
export type ClinicalEncounterRecord = {
  id: string;
  dateLabel: string;
  dentistId: string;
  treatment: string;
  findings: string;
  status: AppointmentStatus;
};

// Historia Clínica's "Documentos" tab — mock metadata only, no real files.
export type ClinicalDocumentKind = "radiografia" | "consentimiento" | "fotografia" | "otro";

export type ClinicalDocument = {
  id: string;
  label: string;
  kind: ClinicalDocumentKind;
  dateLabel: string;
  dentistId: string;
};

export const CLINICAL_DOCUMENT_KIND_LABELS: Record<ClinicalDocumentKind, string> = {
  radiografia: "Radiografía",
  consentimiento: "Consentimiento",
  fotografia: "Fotografía clínica",
  otro: "Documento",
};

// Historia Clínica's "Odontograma" tab — the "Hallazgos" side panel needs a
// fecha/profesional per finding that OdontogramData's own ToothFinding
// doesn't carry (that type is shared with the interactive clinical
// encounter editor, which has no notion of either — not touching it here).
// Keyed by ToothFinding.id so it stays a one-to-one supplement to whatever
// is already in Patient.odontogramData, never a second copy of type/note.
export type OdontogramFindingMeta = {
  findingId: string;
  dateLabel: string;
  dentistId: string;
};

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
  avatar_url?: string;
  // Only set for patients with no appointment in the current mock week —
  // gives "Sin atención +6 meses" real mock coverage without inventing
  // stale entries in WEEK_APPOINTMENTS. Ignored whenever a real matching
  // appointment exists.
  fallbackLastVisitLabel?: string;
  noRecentVisit?: boolean;
  // Whether this patient has an activated Patient Portal account (see
  // src/app/portal/) — drives the "Acceso del paciente" QR card's copy in
  // PatientDetailModal. Only p11 (Valeria Muñoz, the demo CURRENT_PATIENT —
  // see src/lib/current-user.ts) is actually wired to the portal in this
  // mock, so she's the only one marked true; everyone else defaults to the
  // "not yet activated" state, which is realistic this early.
  portalActivated?: boolean;
  // Historia Clínica (Clinic Admin, see clinical-record-screen.tsx) —
  // Resumen tab fields. All optional and only populated for a few patients
  // here; every other patient correctly shows "sin registrar"/"sin
  // alertas" empty states, which is realistic this early and demonstrates
  // both states without inventing data for all 14 mock patients.
  medications?: string[];
  conditions?: string[];
  activeTreatments?: string[];
  odontogramUpdatedLabel?: string;
  clinicalNotes?: string;
  // Remaining Historia Clínica tabs (Antecedentes/Odontograma/Atenciones/
  // Documentos) — same "populate a few patients, everyone else gets a
  // clean empty state" approach as the Resumen fields above.
  anamnesis?: Anamnesis;
  odontogramData?: OdontogramData;
  odontogramFindingsMeta?: OdontogramFindingMeta[];
  clinicalEncounters?: ClinicalEncounterRecord[];
  clinicalDocuments?: ClinicalDocument[];
};

export const PATIENT_STATUS_LABELS: Record<PatientStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
};

export const PATIENTS: Patient[] = [
  {
    // Deliberately NOT "María Gómez" — that's the Clinic Admin's own name
    // (see CURRENT_USER, src/lib/current-user.ts), and having a patient
    // share it read as confusing/wrong. Keep this id's appointment (id "1"
    // in dashboard/mock-data.ts, Wednesday 8:00 AM) in sync if this ever
    // changes again.
    id: "p1",
    name: "Alejandra Vidal",
    initials: "AV",
    age: 34,
    phone: "+57 300 452 1189",
    email: "alejandra.vidal@gmail.com",
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
    // The flagship, fully-populated Historia Clínica demo patient — every
    // tab has real mock content for her (see anamnesis/odontogramData/
    // clinicalEncounters/clinicalDocuments below); everyone else in this
    // list shows this feature's various empty states instead.
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
    allergies: "Alergia a la penicilina",
    status: "active",
    medications: ["Losartán 50mg (1 vez al día)"],
    conditions: ["Hipertensión arterial controlada"],
    odontogramUpdatedLabel: "18 Jun 2026",
    clinicalNotes:
      "Paciente hipertensa controlada; verificar presión arterial antes de procedimientos con anestesia. " +
      "Evitar penicilina — usar alternativa antibiótica si se requiere profilaxis.",
    anamnesis: {
      personalHistory: "Hipertensión arterial diagnosticada hace 3 años, en tratamiento con losartán.",
      familyHistory: "Madre con hipertensión arterial. Padre con diabetes tipo 2.",
      habits: "No fuma. Consumo ocasional de alcohol. Cepillado dental 2 veces al día, uso irregular de hilo dental.",
      surgicalHistory: "Sin cirugías ni hospitalizaciones previas relevantes.",
      otherRelevant: "Sin antecedentes adicionales relevantes.",
      habitsSummary: "No fuma · Alcohol ocasional",
      oralHygieneSummary: "Cepillado 2 veces al día · Hilo dental irregular",
      familyHistorySummary: "Madre: hipertensión · Padre: diabetes tipo 2",
      updatedLabel: "18 Jun 2026",
      updatedByDentistId: "d3",
    },
    odontogramData: {
      16: [{ id: "f1", type: "caries", surfaces: ["oclusal"], note: "Caries oclusal activa." }],
      26: [{ id: "f2", type: "restauracion", surfaces: ["oclusal", "distal"], note: "Resina compuesta." }],
      38: [{ id: "f3", type: "ausente", surfaces: [], note: "Extraído — tercer molar." }],
    },
    // Same 3 findings as odontogramData above, just the fecha/profesional
    // the "Hallazgos" panel needs (see OdontogramFindingMeta's own comment).
    odontogramFindingsMeta: [
      { findingId: "f1", dateLabel: "18 Jun 2026", dentistId: "d3" },
      { findingId: "f2", dateLabel: "10 Ene 2026", dentistId: "d1" },
      { findingId: "f3", dateLabel: "12 Mar 2025", dentistId: "d3" },
    ],
    clinicalEncounters: [
      {
        id: "ce1",
        dateLabel: "18 Jun 2026",
        dentistId: "d3",
        treatment: "Control de ortodoncia",
        findings: "Ajuste de brackets. Leve inflamación gingival; se refuerza técnica de cepillado.",
        status: "completed",
      },
      {
        id: "ce2",
        dateLabel: "10 Ene 2026",
        dentistId: "d1",
        treatment: "Chequeo general",
        findings:
          "Sin caries activas al momento del control. Hipertensión controlada — verificar presión antes de anestesia.",
        status: "completed",
      },
      {
        id: "ce3",
        dateLabel: "12 Mar 2025",
        dentistId: "d3",
        treatment: "Consulta de ortodoncia",
        findings: "Evaluación inicial. Se indica tratamiento de ortodoncia fija. Buena higiene oral.",
        status: "completed",
      },
    ],
    clinicalDocuments: [
      { id: "doc1", label: "Radiografía panorámica", kind: "radiografia", dateLabel: "12 Mar 2025", dentistId: "d3" },
      {
        id: "doc2",
        label: "Consentimiento informado — tratamiento de ortodoncia",
        kind: "consentimiento",
        dateLabel: "12 Mar 2025",
        dentistId: "d3",
      },
      {
        id: "doc3",
        label: "Fotografía clínica intraoral",
        kind: "fotografia",
        dateLabel: "18 Jun 2026",
        dentistId: "d3",
      },
    ],
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
    activeTreatments: ["Ortodoncia — fase 2"],
    odontogramUpdatedLabel: "12 Jul 2026",
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
    conditions: ["Diabetes tipo 2 controlada"],
    medications: ["Metformina 850mg"],
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
    conditions: ["Embarazo (segundo trimestre)"],
    clinicalNotes: "Evitar radiografías dentales salvo urgencia; posponer procedimientos electivos no esenciales.",
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
    // Also the demo Patient-role identity (see CURRENT_PATIENT in
    // src/lib/current-user.ts) — same photo for consistency.
    avatar_url: "https://randomuser.me/api/portraits/women/72.jpg",
    portalActivated: true,
    medications: ["Ibuprofeno 400mg (según necesidad)"],
    conditions: ["Bruxismo leve"],
    activeTreatments: ["Blanqueamiento dental — fase 2"],
    odontogramUpdatedLabel: "5 Ago 2026",
    clinicalNotes: "Sensibilidad dental reportada en la última cita. Evaluar en el próximo control.",
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
    conditions: ["Fibrilación auricular — anticoagulado"],
    medications: ["Warfarina 5mg"],
    clinicalNotes: "Alto riesgo de sangrado; coordinar con médico tratante antes de procedimientos invasivos.",
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
