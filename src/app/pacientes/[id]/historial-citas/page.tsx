import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { fetchAppointmentsForPatient, fetchClinicalProfessionals, type Appointment } from "@/features/dashboard/appointments-data";
import { toBoardProfessional } from "@/features/dashboard/real-format";
import { fetchPatientById } from "@/features/patients/data";
import { RealPatientAppointmentHistoryScreen } from "@/features/patients/real-patient-appointment-history-screen";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Reached from "Ver historial completo"/"Ver historia completa" in
// RealAppointmentDetailModal/RealClinicalEncounterScreen. Confirms the
// patient belongs to the authenticated clinic (tenant isolation, not just
// RLS — see fetchPatientById's own clinic_id check), then renders the same
// real appointments (fetchAppointmentsForPatient, already clinic_id +
// patient_id scoped, already ordered most-recent-first) that
// RealAppointmentDetailModal's own "Historial de citas" panel uses — one
// source of truth for this patient's appointment history, never a second
// query/model.
export default async function PatientAppointmentHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") notFound();

  const patient = await fetchPatientById(supabase, context.clinic.id, id);
  if (!patient) notFound();

  // Appointment history is optional for the page as a whole — a transient
  // failure here shouldn't take down identity/nav, same "optional section"
  // rule as historia-clinica/page.tsx's own fetches.
  let appointments: Appointment[] = [];
  try {
    appointments = await fetchAppointmentsForPatient(supabase, context.clinic.id, patient.id);
  } catch (error) {
    console.error("[/pacientes/[id]/historial-citas] fetchAppointmentsForPatient failed", error);
  }

  // Professional display names — same join pattern as
  // /agenda/atencion/[appointmentId]/page.tsx (fetchClinicalProfessionals +
  // toBoardProfessional), keyed by professionalProfileId for this list's
  // many rows instead of the single lookup that route does.
  let professionalNameById: Record<string, string> = {};
  try {
    const professionals = await fetchClinicalProfessionals(supabase, context.clinic.id);
    professionalNameById = Object.fromEntries(professionals.map(toBoardProfessional).map((p) => [p.professionalProfileId, p.name]));
  } catch (error) {
    console.error("[/pacientes/[id]/historial-citas] fetchClinicalProfessionals failed", error);
  }

  return (
    <AppShell activeNavLabel="Pacientes" heading="Historial de citas" allowedRoles={["clinic-admin", "dentist", "assistant"]}>
      <RealPatientAppointmentHistoryScreen patient={patient} appointments={appointments} professionalNameById={professionalNameById} />
    </AppShell>
  );
}
