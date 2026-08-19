import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ClinicalRecordScreen } from "@/features/patients/clinical-record-screen";
import { PATIENTS } from "@/features/patients/mock-data";

// Reached from "Ver historia clínica" in PatientDetailModal (see
// patients-screen.tsx). Clinic Admin, Dentist and Assistant all reach this
// same screen — see clinical-record-screen.tsx's own comment on how it
// already branches what's editable (canEditAntecedentes, Dentist-only) per
// role, so opening this gate to Assistant needed no other change: an
// Assistant simply never satisfies that check, same as Clinic Admin today,
// making every tab read-only for them automatically. Patient's own variant
// still extends from here later the same way, not a new permissions system.
export default async function PatientClinicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = PATIENTS.find((p) => p.id === id);
  if (!patient) notFound();

  return (
    <AppShell
      activeNavLabel="Pacientes"
      heading="Historia clínica"
      allowedRoles={["clinic-admin", "dentist", "assistant"]}
    >
      <ClinicalRecordScreen patient={patient} />
    </AppShell>
  );
}
