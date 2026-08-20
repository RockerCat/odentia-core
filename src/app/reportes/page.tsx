import { AppShell } from "@/components/shell/app-shell";
import { ReportsScreen } from "@/features/reports/reports-screen";

// First version of Reportes — UI/UX only, mock data (see task scope).
// Clinic Admin and Odontólogo share this same screen (ReportsScreen itself
// scopes every section to "own activity only" for the latter — see task
// scope); still out of Assistant's own nav (see nav-items.ts/role.ts).
export default function ReportesPage() {
  return (
    <AppShell activeNavLabel="Reportes" heading="Reportes" allowedRoles={["clinic-admin", "dentist"]}>
      <ReportsScreen />
    </AppShell>
  );
}
