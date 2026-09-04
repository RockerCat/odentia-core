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
import { notFound, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { Appointment } from "@/features/dashboard/appointments-data";
import type { ClinicalEncounterRecord } from "@/features/patients/clinical-encounters-data";
import type { ClinicalNoteRecord } from "@/features/patients/clinical-notes-data";
import type { PatientMedicalHistory } from "@/features/patients/medical-history-data";
import { PatientClinicalRecordScreen } from "@/features/patients/patient-clinical-record-screen";
import type { TreatmentPlanItem } from "@/features/patients/treatment-plan-data";
import type { ToothFindingRecord } from "@/features/patients/tooth-findings-data";
import type { Treatment } from "@/features/treatments/data";

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

// Card 8 ("Notas clínicas importantes") regression fixture — one active
// (most recent), one archived (must NEVER show on the card or in the PDF —
// see qa-clinical-notes-check.mjs) and one long-content active note (must
// wrap, never overflow/break the card's layout).
const FIXTURE_CLINICAL_NOTES: ClinicalNoteRecord[] = [
  {
    id: "e1a2b3c4-0000-4000-8000-000000000001",
    patientId: FIXTURE_PATIENT_ID,
    content: "Paciente reporta ansiedad dental significativa; considerar sedación consciente para procedimientos futuros.",
    createdBy: FIXTURE_PROF_ID,
    updatedBy: FIXTURE_PROF_ID,
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z",
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "e1a2b3c4-0000-4000-8000-000000000002",
    patientId: FIXTURE_PATIENT_ID,
    content:
      "Historial extenso de sensibilidad a anestésicos locales tipo amida; se documentó reacción adversa leve (taquicardia transitoria) en procedimiento previo bajo lidocaína — se recomienda evaluar articaína o mepivacaína como alternativa y monitorear signos vitales durante toda la atención, notificando al paciente sobre el cambio de protocolo antes de iniciar cualquier procedimiento invasivo.",
    createdBy: FIXTURE_PROF_ID,
    updatedBy: null,
    createdAt: "2026-09-02T09:00:00.000Z",
    updatedAt: "2026-09-02T09:00:00.000Z",
    archivedAt: null,
    archivedBy: null,
  },
  {
    id: "e1a2b3c4-0000-4000-8000-000000000003",
    patientId: FIXTURE_PATIENT_ID,
    content: "Nota antigua ya resuelta — archivada.",
    createdBy: FIXTURE_PROF_ID,
    updatedBy: FIXTURE_PROF_ID,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    archivedAt: "2026-08-15T09:00:00.000Z",
    archivedBy: FIXTURE_PROF_ID,
  },
];

// Card 5 ("Tratamientos activos") regression fixture — two active
// (planned/in_progress, one long-content to check the "no rompe layout"
// requirement), one completed and one cancelled (must NEVER count as
// active, but must still exist for the "Completados"/"Cancelados" plan
// modal filters — see qa-treatment-plan-check.mjs).
const TREATMENT_CATALOG_ID = "d4e5f6a7-0000-4000-8000-000000000001";
const FIXTURE_TREATMENT_CATALOG: Treatment[] = [
  // Deliberately a DIFFERENT name than item 1's own treatmentName snapshot
  // below — simulates the catalog having been renamed since that item was
  // created. The item must keep showing its own historical snapshot
  // ("Limpieza dental"), never this current catalog name — see
  // qa-treatment-plan-check.mjs's own dedicated scenario for this.
  { id: TREATMENT_CATALOG_ID, clinicId: FIXTURE_CLINIC_ID, name: "Limpieza dental Premium (renombrado)", active: true, createdAt: "2026-08-01T00:00:00.000Z" },
  { id: "d4e5f6a7-0000-4000-8000-000000000002", clinicId: FIXTURE_CLINIC_ID, name: "Blanqueamiento dental", active: true, createdAt: "2026-08-01T00:00:00.000Z" },
];
const FIXTURE_TREATMENT_PLAN_ITEMS: TreatmentPlanItem[] = [
  {
    id: "f6e5d4c3-0000-4000-8000-000000000001",
    planId: "p1a2n3-0000-4000-8000-000000000001",
    patientId: FIXTURE_PATIENT_ID,
    treatmentId: TREATMENT_CATALOG_ID,
    treatmentName: "Limpieza dental",
    status: "planned",
    notes: null,
    sortOrder: 0,
    createdBy: FIXTURE_PROF_ID,
    updatedBy: null,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
  },
  {
    id: "f6e5d4c3-0000-4000-8000-000000000002",
    planId: "p1a2n3-0000-4000-8000-000000000001",
    patientId: FIXTURE_PATIENT_ID,
    treatmentId: null,
    treatmentName: "Tratamiento de conducto en pieza 46 con posible necesidad de corona posterior según evolución radiográfica",
    status: "in_progress",
    notes: "Paciente reporta sensibilidad persistente; reevaluar en próxima cita antes de continuar con la siguiente fase.",
    sortOrder: 1,
    createdBy: FIXTURE_PROF_ID,
    updatedBy: FIXTURE_PROF_ID,
    createdAt: "2026-09-02T09:00:00.000Z",
    updatedAt: "2026-09-03T09:00:00.000Z",
  },
  {
    id: "f6e5d4c3-0000-4000-8000-000000000003",
    planId: "p1a2n3-0000-4000-8000-000000000001",
    patientId: FIXTURE_PATIENT_ID,
    treatmentId: null,
    treatmentName: "Extracción diente 18 — ya realizada",
    status: "completed",
    notes: null,
    sortOrder: 2,
    createdBy: FIXTURE_PROF_ID,
    updatedBy: FIXTURE_PROF_ID,
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-20T09:00:00.000Z",
  },
  {
    id: "f6e5d4c3-0000-4000-8000-000000000004",
    planId: "p1a2n3-0000-4000-8000-000000000001",
    patientId: FIXTURE_PATIENT_ID,
    treatmentId: null,
    treatmentName: "Ortodoncia — paciente decidió no continuar",
    status: "cancelled",
    notes: null,
    sortOrder: 3,
    createdBy: FIXTURE_PROF_ID,
    updatedBy: FIXTURE_PROF_ID,
    createdAt: "2026-08-10T09:00:00.000Z",
    updatedAt: "2026-08-12T09:00:00.000Z",
  },
];

// ?role=assistant lets scripts/qa-clinical-notes-check.mjs exercise the
// Asistente read-only gate (create/edit/archive controls hidden) without a
// real Supabase session — real Historia Clínica always derives
// canEditClinicalData() from resolveClinicContext() server-side (see that
// route's own comment); the real enforcement boundary either way is
// is_active_clinical_professional() at the RPC layer, never this prop
// alone. useSearchParams (Client Component) needs a Suspense boundary per
// Next's own requirement — see the default export below.
function PatientRecordPreviewContent({
  canEditClinicalData,
  clinicalNotes,
  treatmentPlanItems,
}: {
  canEditClinicalData: boolean;
  clinicalNotes: ClinicalNoteRecord[];
  treatmentPlanItems: TreatmentPlanItem[];
}) {
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
      clinicalNotes={clinicalNotes}
      treatmentPlanItems={treatmentPlanItems}
      treatmentOptions={FIXTURE_TREATMENT_CATALOG}
      appointments={FIXTURE_APPOINTMENTS}
      canEditClinicalData={canEditClinicalData}
    />
  );
}

export default function PatientRecordPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Suspense fallback={null}>
      <PatientRecordPreviewSearchParamsGate />
    </Suspense>
  );
}

function PatientRecordPreviewSearchParamsGate() {
  const searchParams = useSearchParams();
  const canEditClinicalData = searchParams.get("role") !== "assistant";
  // ?notes=empty lets scripts/qa-clinical-notes-check.mjs exercise the
  // "Sin notas clínicas importantes" empty state without a separate fixture
  // route.
  const clinicalNotes = searchParams.get("notes") === "empty" ? [] : FIXTURE_CLINICAL_NOTES;
  // ?plan=empty lets scripts/qa-treatment-plan-check.mjs exercise the
  // "Sin tratamientos activos" empty state without a separate fixture route.
  const treatmentPlanItems = searchParams.get("plan") === "empty" ? [] : FIXTURE_TREATMENT_PLAN_ITEMS;
  return (
    <PatientRecordPreviewContent
      canEditClinicalData={canEditClinicalData}
      clinicalNotes={clinicalNotes}
      treatmentPlanItems={treatmentPlanItems}
    />
  );
}
