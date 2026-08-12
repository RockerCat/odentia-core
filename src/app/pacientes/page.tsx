import { PatientsGreeting } from "@/components/patients-greeting";
import { AppShell } from "@/components/shell/app-shell";
import { PatientsScreen } from "@/features/patients/patients-screen";

// Clinic Admin's Pacientes screen — sees every patient regardless of
// dentist (see CLAUDE.md Domain Model: patients belong to the clinic, not
// to a single dentist).
export default function PatientsPage() {
  return (
    <AppShell
      activeNavLabel="Pacientes"
      heading={<PatientsGreeting />}
      allowedRoles={["clinic-admin", "dentist", "assistant", "superadmin"]}
    >
      <PatientsScreen />
    </AppShell>
  );
}
