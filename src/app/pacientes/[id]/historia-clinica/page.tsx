import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { fetchPatientClinicalDocuments } from "@/features/patients/clinical-documents-data";
import { fetchPatientClinicalEncounters } from "@/features/patients/clinical-encounters-data";
import { canEditClinicalData } from "@/features/patients/clinical-permissions";
import { fetchPatientById } from "@/features/patients/data";
import { fetchPatientMedicalHistory, type PatientMedicalHistory } from "@/features/patients/medical-history-data";
import { PatientClinicalRecordScreen } from "@/features/patients/patient-clinical-record-screen";
import { fetchPatientToothFindings } from "@/features/patients/tooth-findings-data";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Reached from "Ver historia clínica" in PatientRecordModal (see
// patients-screen.tsx). Confirms the patient belongs to the authenticated
// clinic (tenant isolation, not just RLS — see fetchPatientById's own
// clinic_id check), then renders the real tabbed shell (see
// patient-clinical-record-screen.tsx) — real identity, real Antecedentes
// (public.patient_medical_histories), real Odontograma
// (public.patient_tooth_findings), real Atenciones
// (public.patient_clinical_encounters, read-only — see that migration's
// own comment on why), real Documentos (public.patient_clinical_documents
// + the private clinical-documents Storage bucket), and a real "Descargar
// PDF" export (see pdf/real-clinical-record-document.tsx) built from the
// same real rows fetched here — clinicName/clinicLogoUrl come from this
// same tenant-scoped context.clinic, never a second lookup.
// canEditClinicalData() derives write access from the real
// membership.role + professional_profile.active resolved here
// server-side — never the DEV role switcher.
export default async function PatientClinicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") notFound();

  const patient = await fetchPatientById(supabase, context.clinic.id, id);
  if (!patient) notFound();

  // Antecedentes is optional for the page as a whole — a transient
  // failure here shouldn't take down identity/tab navigation, which
  // already loaded successfully (see CLAUDE.md task scope: don't crash
  // AppShell over an expected/recoverable null).
  let medicalHistory: PatientMedicalHistory | null = null;
  try {
    medicalHistory = await fetchPatientMedicalHistory(supabase, context.clinic.id, patient.id);
  } catch (error) {
    console.error("[/pacientes/[id]/historia-clinica] fetchPatientMedicalHistory failed", error);
  }

  // Odontograma is optional for the page as a whole too — same reasoning
  // as medicalHistory above: an empty odontogram (zero findings) is itself
  // a valid, always-rendered state, but a transient fetch failure
  // shouldn't take down identity/tab navigation either.
  let toothFindings: Awaited<ReturnType<typeof fetchPatientToothFindings>> = [];
  try {
    toothFindings = await fetchPatientToothFindings(supabase, context.clinic.id, patient.id);
  } catch (error) {
    console.error("[/pacientes/[id]/historia-clinica] fetchPatientToothFindings failed", error);
  }

  // Atenciones follows the same "optional for the page" rule as
  // Antecedentes/Odontograma above.
  let clinicalEncounters: Awaited<ReturnType<typeof fetchPatientClinicalEncounters>> = [];
  try {
    clinicalEncounters = await fetchPatientClinicalEncounters(supabase, context.clinic.id, patient.id);
  } catch (error) {
    console.error("[/pacientes/[id]/historia-clinica] fetchPatientClinicalEncounters failed", error);
  }

  // Documentos follows the same "optional for the page" rule as the other
  // clinical tabs above.
  let clinicalDocuments: Awaited<ReturnType<typeof fetchPatientClinicalDocuments>> = [];
  try {
    clinicalDocuments = await fetchPatientClinicalDocuments(supabase, context.clinic.id, patient.id);
  } catch (error) {
    console.error("[/pacientes/[id]/historia-clinica] fetchPatientClinicalDocuments failed", error);
  }

  return (
    <AppShell activeNavLabel="Pacientes" heading="Historia clínica" allowedRoles={["clinic-admin", "dentist", "assistant"]}>
      <PatientClinicalRecordScreen
        patient={patient}
        clinicId={context.clinic.id}
        clinicName={context.clinic.name}
        clinicLogoUrl={context.clinic.logoUrl}
        medicalHistory={medicalHistory}
        toothFindings={toothFindings}
        clinicalEncounters={clinicalEncounters}
        clinicalDocuments={clinicalDocuments}
        canEditClinicalData={canEditClinicalData(context)}
      />
    </AppShell>
  );
}
