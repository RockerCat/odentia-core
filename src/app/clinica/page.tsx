import { AppShell } from "@/components/shell/app-shell";
import { ClinicSettingsScreen } from "@/features/clinic/clinic-settings-screen";

// Clinic-wide configuration — Clinic Admin only (Dentist/Assistant filter
// "Clínica" out of their own nav, see src/dev/role.ts). Manages identity
// (name/logo/contact info), team (dentists/assistants), the Admin's own
// optional professional profile, and rooms — all UI/UX with mock data,
// see ClinicSettingsScreen.
export default function ClinicaPage() {
  return (
    <AppShell activeNavLabel="Clínica" heading="Clínica" allowedRoles={["clinic-admin"]}>
      <ClinicSettingsScreen />
    </AppShell>
  );
}
