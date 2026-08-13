import { AppShell } from "@/components/shell/app-shell";
import { ClinicSettingsScreen } from "@/features/clinic/clinic-settings-screen";

// Clinic-wide configuration — Clinic Admin only (Dentist/Assistant filter
// "Clínica" out of their own nav, see src/dev/role.ts). First step here is
// just general info + the clinic's own logo (branding, first step).
export default function ClinicaPage() {
  return (
    <AppShell activeNavLabel="Clínica" heading="Clínica" allowedRoles={["clinic-admin"]}>
      <ClinicSettingsScreen />
    </AppShell>
  );
}
