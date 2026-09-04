"use client";

// Dev-only QA fixture — deterministic data for
// scripts/qa-loading-feedback-check.mjs's "Descargar PDF" scenario, for
// scripts/qa-historia-clinica-ultima-atencion-check.mjs's regression on the
// real "Historia Clínica no refleja atenciones reales" bug ("Última
// atención" was a hardcoded literal, never wired to clinicalEncounters),
// and for scripts/qa-resumen-cards-check.mjs's regression on ALL 8 Resumen
// cards ("PROMPT NINJA — Auditar y conectar TODO el Resumen") — see
// resumen-tab.tsx's own top comment for the full per-card audit.
// PatientClinicalRecordScreen is "use client" itself (no Server→Client
// boundary concern here, unlike /dev-qa/agenda-preview), so a plain client
// fixture is faithful — no real Supabase session needed to observe
// handleDownloadPdf's immediate pending state ("Generando…", disabled) and
// its error-recovery path (fetchTeamMembers throws without a session,
// exercising the catch branch this task added). That same no-session
// constraint means the odontogram card's professional-name resolution
// (resolveUpdatedByProfessional → fetchTeamMembers) always 401s here and
// falls back to date-only — expected, allowlisted by qa-lib.mjs the same
// way every other write/read against a real Supabase table already is in
// this fixture; the date itself (the part this regression is about) never
// depends on that resolution succeeding.
// 404s outside development — never a real, production-reachable route.
import { notFound } from "next/navigation";
import type { Appointment } from "@/features/dashboard/appointments-data";
import type { ClinicalEncounterRecord } from "@/features/patients/clinical-encounters-data";
import type { PatientMedicalHistory } from "@/features/patients/medical-history-data";
import { PatientClinicalRecordScreen } from "@/features/patients/patient-clinical-record-screen";
import type { ToothFindingRecord } from "@/features/patients/tooth-findings-data";

const FIXTURE_PATIENT_ID = "8e462860-7898-471f-bcab-a64fc357ae5e";
const FIXTURE_CLINIC_ID = "00000000-0000-4000-8000-000000000001";
const FIXTURE_PROF_ID = "225d222d-2481-4d05-9750-bfdd30b6a5db";

// Real antecedentes — cards 1–3 (Alergias/Medicamentos/Condiciones) read
// this directly, no derivation.
const FIXTURE_MEDICAL_HISTORY: PatientMedicalHistory = {
  id: "b1c2d3e4-0000-4000-8000-000000000001",
  patientId: FIXTURE_PATIENT_ID,
  allergies: "Penicilina",
  currentMedications: "Ninguno",
  medicalConditions: "Hipertensión controlada",
  surgeriesOrHospitalizations: null,
  relevantFamilyHistory: null,
  observations: null,
  updatedBy: FIXTURE_PROF_ID,
  updatedAt: "2026-09-03T12:00:00.000Z",
};

// Several updates across different teeth/dates — [most recent] must win
// for card 7 ("Última actualización del odontograma"), never the first or
// an arbitrary one.
const FIXTURE_TOOTH_FINDINGS: ToothFindingRecord[] = [
  {
    id: "c1d2e3f4-0000-4000-8000-000000000001",
    patientId: FIXTURE_PATIENT_ID,
    toothFdi: 11,
    findingType: "caries",
    surfaces: ["oclusal"],
    note: "Caries incipiente",
    recordedBy: FIXTURE_PROF_ID,
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "c1d2e3f4-0000-4000-8000-000000000002",
    patientId: FIXTURE_PATIENT_ID,
    toothFdi: 21,
    findingType: "restauracion",
    surfaces: ["vestibular", "mesial"],
    note: "Resina compuesta",
    recordedBy: FIXTURE_PROF_ID,
    createdAt: "2026-08-25T09:00:00.000Z",
    updatedAt: "2026-08-25T09:00:00.000Z",
  },
  {
    id: "c1d2e3f4-0000-4000-8000-000000000003",
    patientId: FIXTURE_PATIENT_ID,
    toothFdi: 36,
    findingType: "ausente",
    surfaces: [],
    note: null,
    recordedBy: FIXTURE_PROF_ID,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
  },
  {
    id: "c1d2e3f4-0000-4000-8000-000000000004",
    patientId: FIXTURE_PATIENT_ID,
    toothFdi: 46,
    findingType: "caries",
    surfaces: ["oclusal", "distal"],
    note: "Requiere seguimiento",
    recordedBy: FIXTURE_PROF_ID,
    createdAt: "2026-09-04T09:00:00.000Z",
    updatedAt: "2026-09-04T09:00:00.000Z",
  },
];

// One future, non-terminal appointment — card 6 ("Próxima cita") must
// find exactly this one, never derived from clinicalEncounters (which are
// always in the past).
const FIXTURE_APPOINTMENTS: Appointment[] = [
  {
    id: "a9b8c7d6-0000-4000-8000-000000000001",
    clinicId: FIXTURE_CLINIC_ID,
    patientId: FIXTURE_PATIENT_ID,
    patientName: "Laura Diaz",
    patientPhone: "+573173672033",
    professionalProfileId: FIXTURE_PROF_ID,
    startsAt: "2026-09-20T14:00:00.000Z",
    durationMinutes: 30,
    reason: "Control de ortodoncia",
    room: "Consultorio 1",
    contactPhone: "+573173672033",
    notes: null,
    status: "confirmed",
    patientArrivedAt: null,
    createdAt: "2026-09-04T10:00:00.000Z",
    updatedAt: "2026-09-04T10:00:00.000Z",
  },
];

// Shaped exactly like fetchPatientClinicalEncounters' own return value
// (patients/clinical-encounters-data.ts): already filtered to
// finalized_at IS NOT NULL, already ordered occurred_at desc. A draft
// (finalized_at null) or a completed appointment with no encounter never
// reaches this far in production — that's proven directly against the
// query builder in clinical-encounters-data.test.ts, not re-simulated
// here client-side, since PatientClinicalRecordScreen never receives an
// appointments prop at all (Historia Clínica only ever reads
// patient_clinical_encounters, never derives one from an appointment).
const FIXTURE_ENCOUNTERS: ClinicalEncounterRecord[] = [
  {
    id: "f1e2d3c4-0001-4000-8000-000000000001",
    patientId: FIXTURE_PATIENT_ID,
    appointmentId: "a1b2c3d4-0001-4000-8000-000000000001",
    occurredAt: "2026-09-04T15:35:25.221Z",
    reason: "Chequeo general",
    diagnosis: null,
    treatment: "Control de ortodoncia, Blanqueamiento dental",
    notes: "nota 10",
    indications: "indicaciones",
    attendedBy: null,
    finalizedAt: "2026-09-04T15:36:46.437Z",
    createdAt: "2026-09-04T15:35:25.691Z",
  },
  {
    id: "f1e2d3c4-0002-4000-8000-000000000002",
    patientId: FIXTURE_PATIENT_ID,
    appointmentId: "a1b2c3d4-0002-4000-8000-000000000002",
    occurredAt: "2026-09-04T14:36:41.509Z",
    reason: "Consulta de ortodoncia",
    diagnosis: null,
    treatment: "Blanqueamiento dental, Extracción dental",
    notes: "nota2",
    indications: "indicaciones",
    attendedBy: null,
    finalizedAt: "2026-09-04T14:40:23.507Z",
    createdAt: "2026-09-04T14:36:41.809Z",
  },
];

export default function PatientRecordPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <PatientClinicalRecordScreen
      patient={{
        id: FIXTURE_PATIENT_ID,
        firstName: "Laura",
        lastName: "Diaz",
        documentId: "111",
        phone: "+573173672033",
        email: null,
        birthDate: "1990-05-01",
        active: true,
        createdAt: new Date().toISOString(),
      }}
      clinicId={FIXTURE_CLINIC_ID}
      clinicName="Dental Test"
      clinicLogoUrl={null}
      medicalHistory={FIXTURE_MEDICAL_HISTORY}
      toothFindings={FIXTURE_TOOTH_FINDINGS}
      clinicalEncounters={FIXTURE_ENCOUNTERS}
      clinicalDocuments={[]}
      appointments={FIXTURE_APPOINTMENTS}
      canEditClinicalData={true}
    />
  );
}
