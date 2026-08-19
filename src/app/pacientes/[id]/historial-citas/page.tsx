import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { PatientAppointmentHistoryScreen } from "@/features/patients/patient-appointment-history-screen";
import { PATIENTS } from "@/features/patients/mock-data";

// Reached from "Ver historial completo" in the appointment modal (see
// AppointmentDetailModal in appointment-detail-modal.tsx) — the one
// dedicated screen for a patient's full chronological appointment history.
// Same allowedRoles as /pacientes itself, since every role that can open
// that modal can also reach this screen from it.
export default async function PatientAppointmentHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = PATIENTS.find((p) => p.id === id);
  if (!patient) notFound();

  return (
    <AppShell
      activeNavLabel="Pacientes"
      heading="Historial de citas"
      allowedRoles={["clinic-admin", "dentist", "assistant"]}
    >
      <PatientAppointmentHistoryScreen patient={patient} />
    </AppShell>
  );
}
