import { PatientsGreeting } from "@/components/patients-greeting";
import { AppShell } from "@/components/shell/app-shell";
import { fetchPatients, type Patient } from "@/features/patients/data";
import { PatientsScreen } from "@/features/patients/patients-screen";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Clinic Admin's Pacientes screen — sees every patient regardless of
// dentist (see CLAUDE.md Domain Model: patients belong to the clinic, not
// to a single dentist). Server-first (same pattern as /clinica): resolves
// the real clinic context and the real patient list here, before any
// client render. src/lib/supabase/proxy.ts already gates this route on a
// real, active membership, so clinic_id here is never accepted from a
// URL/form/localStorage/RoleContext — it only ever comes from
// resolveClinicContext. canCreatePatient comes from the REAL membership
// role (clinic_admin/assistant, matching patients_insert_admin_or_assistant
// RLS — dentist is excluded), never the DEV role switcher.
export default async function PatientsPage() {
  const supabase = await createClient();

  let context;
  try {
    context = await resolveClinicContext(supabase);
  } catch (error) {
    console.error("[/pacientes] resolveClinicContext failed", error);
    return (
      <AppShell activeNavLabel="Pacientes" heading="Pacientes" allowedRoles={["clinic-admin", "dentist", "assistant"]}>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar tus pacientes. Intenta de nuevo en unos minutos.
        </p>
      </AppShell>
    );
  }

  let patients: Patient[] = [];
  let loadFailed = false;
  if (context.status === "ok") {
    try {
      patients = await fetchPatients(supabase, context.clinic.id);
    } catch (error) {
      console.error("[/pacientes] fetchPatients failed", error);
      loadFailed = true;
    }
  }

  const canCreatePatient = context.status === "ok" && context.membership.role !== "dentist";

  return (
    <AppShell activeNavLabel="Pacientes" heading={<PatientsGreeting />} allowedRoles={["clinic-admin", "dentist", "assistant"]}>
      {loadFailed ? (
        <p className="text-sm text-muted-foreground">
          No pudimos cargar tus pacientes. Intenta de nuevo en unos minutos.
        </p>
      ) : (
        <PatientsScreen initialPatients={patients} clinicId={context.status === "ok" ? context.clinic.id : null} canCreatePatient={canCreatePatient} />
      )}
    </AppShell>
  );
}
