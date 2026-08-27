import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { fetchPatientById } from "@/features/patients/data";
import { PatientPlaceholderScreen } from "@/features/patients/patient-placeholder-screen";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Reached from "Ver historial completo" in Agenda's appointment modal (see
// AppointmentDetailModal — still mock, out of scope for this task). No
// appointments table exists yet (see CLAUDE.md task scope), so this only
// does two real things: confirm the patient belongs to the authenticated
// clinic (tenant isolation, not just RLS — see fetchPatientById's own
// clinic_id check) and show an honest empty state instead of the fully-mock
// appointment-history screen that used to render here.
export default async function PatientAppointmentHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") notFound();

  const patient = await fetchPatientById(supabase, context.clinic.id, id);
  if (!patient) notFound();

  return (
    <AppShell activeNavLabel="Pacientes" heading="Historial de citas" allowedRoles={["clinic-admin", "dentist", "assistant"]}>
      <PatientPlaceholderScreen patient={patient} message="Aún no hay citas registradas." />
    </AppShell>
  );
}
