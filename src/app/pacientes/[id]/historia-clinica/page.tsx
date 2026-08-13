import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ClinicalRecordScreen } from "@/features/patients/clinical-record-screen";
import { PATIENTS } from "@/features/patients/mock-data";

// Reached from "Ver historia clínica" in PatientDetailModal (see
// patients-screen.tsx). Clinic Admin only for this first stage — see
// clinical-record-screen.tsx's own comment on how Dentist/Assistant/
// Patient variants extend from here later via allowedRoles, not a new
// permissions system.
export default async function PatientClinicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = PATIENTS.find((p) => p.id === id);
  if (!patient) notFound();

  return (
    <AppShell activeNavLabel="Pacientes" heading="Historia clínica" allowedRoles={["clinic-admin"]}>
      <ClinicalRecordScreen patient={patient} />
    </AppShell>
  );
}
