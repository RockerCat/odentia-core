import { PortalShell } from "@/components/shell/portal-shell";
import { MyAppointmentsScreen } from "@/features/portal/my-appointments-screen";

// The Patient's main destination — see homeRouteForRole in src/dev/role.ts.
// No heading: the screen starts directly with the "Próxima cita" card
// instead of a redundant "Mis citas" title — activeNavLabel still keeps
// "Mis citas" highlighted in the nav.
export default function PortalAppointmentsPage() {
  return (
    <PortalShell activeNavLabel="Mis citas">
      <MyAppointmentsScreen />
    </PortalShell>
  );
}
