import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { fetchPatientById } from "@/features/patients/data";
import { PatientPlaceholderScreen } from "@/features/patients/patient-placeholder-screen";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Reached from "Ver historia clínica" in PatientDetailModal (see
// patients-screen.tsx). No clinical schema exists yet (no odontograma/
// antecedentes/atenciones/documentos tables — see CLAUDE.md task scope:
// "Pacientes base real" explicitly excludes Historia Clínica), so this
// only does two real things: confirm the patient belongs to the
// authenticated clinic (tenant isolation, not just RLS — see
// fetchPatientById's own clinic_id check) and show an honest empty state
// instead of the fully-mock clinical module that used to render here.
export default async function PatientClinicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") notFound();

  const patient = await fetchPatientById(supabase, context.clinic.id, id);
  if (!patient) notFound();

  return (
    <AppShell activeNavLabel="Pacientes" heading="Historia clínica" allowedRoles={["clinic-admin", "dentist", "assistant"]}>
      <PatientPlaceholderScreen patient={patient} message="Aún no hay información clínica registrada." />
    </AppShell>
  );
}
