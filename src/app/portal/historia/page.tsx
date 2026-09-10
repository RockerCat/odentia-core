import { PortalShell } from "@/components/shell/portal-shell";
import { fetchAppointmentsForPatient } from "@/features/dashboard/appointments-data";
import { fetchPatientClinicalDocuments } from "@/features/patients/clinical-documents-data";
import { fetchEncounterClinicalDataForEncounters, fetchPatientClinicalEncounters } from "@/features/patients/clinical-encounters-data";
import { fetchPatientClinicalNotes } from "@/features/patients/clinical-notes-data";
import { fetchPatientById, type Patient } from "@/features/patients/data";
import { fetchPatientMedicalHistory, type PatientMedicalHistory } from "@/features/patients/medical-history-data";
import { fetchPatientTreatmentPlanItems } from "@/features/patients/treatment-plan-data";
import { fetchPatientToothFindings } from "@/features/patients/tooth-findings-data";
import { PatientMedicalRecordScreen } from "@/features/portal/patient-medical-record-screen";
import { resolvePatientContext } from "@/features/session/resolve-patient-context";
import { createClient } from "@/lib/supabase/server";

// Real /portal/historia — the same real expediente Historia Clínica
// (staff) reads/writes, resolved EXCLUSIVELY from auth.uid() →
// resolvePatientContext() → patient_id + clinic_id (context.patient.id/
// clinicId) — never a patient_id/clinic_id from the URL, a query param, or
// a client prop that could widen access. Every fetch below is the exact
// same real function the staff page already calls
// (/pacientes/[id]/historia-clinica/page.tsx) — no duplicated data layer —
// scoped by the fresh RLS policies added for this real read (see
// 20260908100000_patient_select_own_clinical_record.sql): a Patient can
// only ever get her OWN rows back, and — critically —
// fetchPatientClinicalEncounters' own `finalized_at is not null` filter is
// backed by that same condition baked into the RLS policy itself, not
// just this query, so a draft/in_progress encounter can never reach this
// page even if the filter here were ever removed by mistake.
//
// Same "optional per tab, never crash the whole page" pattern the staff
// page already uses: a transient failure on one clinical table degrades
// only that tab to its honest empty state, never the identity header/tab
// navigation that already loaded successfully.
export default async function PortalMedicalRecordPage() {
  const supabase = await createClient();
  const context = await resolvePatientContext(supabase);

  if (context.status !== "ok") {
    return (
      <PortalShell activeNavLabel="Mi Historia Clínica" heading="Mi Historia Clínica">
        <div className="rounded-2xl border border-border bg-background p-5 text-center text-sm text-muted-foreground shadow-sm sm:p-6">
          No pudimos cargar tu historia clínica. Intenta de nuevo en unos minutos.
        </div>
      </PortalShell>
    );
  }

  const clinicId = context.patient.clinicId;
  const patientId = context.patient.id;

  // patients_select_own_via_link already lets a Patient read her OWN
  // patients row (see that policy's own migration) — fetchPatientById is
  // reused unchanged, same "clinic_id filter redundant with RLS, kept
  // anyway" convention as every other clinical fetcher.
  let patient: Patient | null = null;
  try {
    patient = await fetchPatientById(supabase, clinicId, patientId);
  } catch (error) {
    console.error("[/portal/historia] fetchPatientById failed", error);
  }

  if (!patient) {
    return (
      <PortalShell activeNavLabel="Mi Historia Clínica" heading="Mi Historia Clínica">
        <div className="rounded-2xl border border-border bg-background p-5 text-center text-sm text-muted-foreground shadow-sm sm:p-6">
          No pudimos cargar tu historia clínica. Intenta de nuevo en unos minutos.
        </div>
      </PortalShell>
    );
  }

  let medicalHistory: PatientMedicalHistory | null = null;
  try {
    medicalHistory = await fetchPatientMedicalHistory(supabase, clinicId, patientId);
  } catch (error) {
    console.error("[/portal/historia] fetchPatientMedicalHistory failed", error);
  }

  let toothFindings: Awaited<ReturnType<typeof fetchPatientToothFindings>> = [];
  try {
    toothFindings = await fetchPatientToothFindings(supabase, clinicId, patientId);
  } catch (error) {
    console.error("[/portal/historia] fetchPatientToothFindings failed", error);
  }

  // finalized_at IS NOT NULL only — enforced again by RLS itself (see the
  // migration), not solely by this query's own filter.
  let clinicalEncounters: Awaited<ReturnType<typeof fetchPatientClinicalEncounters>> = [];
  try {
    clinicalEncounters = await fetchPatientClinicalEncounters(supabase, clinicId, patientId);
  } catch (error) {
    console.error("[/portal/historia] fetchPatientClinicalEncounters failed", error);
  }

  // RIPS #4 — same batched diagnósticos/servicios fetch the staff page
  // uses. NOTE: encounter_diagnoses/encounter_services only have an
  // is_clinic_member(clinic_id) SELECT policy today (see the migration) —
  // a Patient isn't a clinic member, so RLS silently returns zero rows
  // here and AtencionesTab simply shows no Diagnósticos/Servicios lines
  // for now. Not a crash, not a leak — just not yet exposed to the
  // Patient Portal specifically; extending that read would need its own
  // additive RLS policy, out of this task's scope.
  let encounterClinicalData: Awaited<ReturnType<typeof fetchEncounterClinicalDataForEncounters>> = new Map();
  try {
    encounterClinicalData = await fetchEncounterClinicalDataForEncounters(
      supabase,
      clinicId,
      clinicalEncounters.map((e) => e.id),
    );
  } catch (error) {
    console.error("[/portal/historia] fetchEncounterClinicalDataForEncounters failed", error);
  }

  let clinicalDocuments: Awaited<ReturnType<typeof fetchPatientClinicalDocuments>> = [];
  try {
    clinicalDocuments = await fetchPatientClinicalDocuments(supabase, clinicId, patientId);
  } catch (error) {
    console.error("[/portal/historia] fetchPatientClinicalDocuments failed", error);
  }

  let clinicalNotes: Awaited<ReturnType<typeof fetchPatientClinicalNotes>> = [];
  try {
    clinicalNotes = await fetchPatientClinicalNotes(supabase, clinicId, patientId);
  } catch (error) {
    console.error("[/portal/historia] fetchPatientClinicalNotes failed", error);
  }

  let treatmentPlanItems: Awaited<ReturnType<typeof fetchPatientTreatmentPlanItems>> = [];
  try {
    treatmentPlanItems = await fetchPatientTreatmentPlanItems(supabase, clinicId, patientId);
  } catch (error) {
    console.error("[/portal/historia] fetchPatientTreatmentPlanItems failed", error);
  }

  // Resumen's own "Próxima cita" card — reuses fetchAppointmentsForPatient,
  // already patient-readable since "PROMPT NINJA — Mis citas"
  // (appointments_select_own_via_patient_link), no new policy needed here.
  let appointments: Awaited<ReturnType<typeof fetchAppointmentsForPatient>> = [];
  try {
    appointments = await fetchAppointmentsForPatient(supabase, clinicId, patientId);
  } catch (error) {
    console.error("[/portal/historia] fetchAppointmentsForPatient failed", error);
  }

  return (
    <PortalShell activeNavLabel="Mi Historia Clínica" heading="Mi Historia Clínica">
      <PatientMedicalRecordScreen
        patient={patient}
        clinicId={clinicId}
        medicalHistory={medicalHistory}
        toothFindings={toothFindings}
        clinicalEncounters={clinicalEncounters}
        encounterClinicalData={encounterClinicalData}
        clinicalDocuments={clinicalDocuments}
        clinicalNotes={clinicalNotes}
        treatmentPlanItems={treatmentPlanItems}
        appointments={appointments}
      />
    </PortalShell>
  );
}
