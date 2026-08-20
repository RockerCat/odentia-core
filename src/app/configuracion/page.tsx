import { AppShell } from "@/components/shell/app-shell";
import { ConfiguracionScreen } from "@/features/settings/configuracion-screen";

// Configuración — shared route/nav entry for Clinic Admin and Dentist
// (Assistant has no "Configuración", see nav-items.ts/role.ts), but each
// role sees a distinct screen (see ConfiguracionScreen): Clinic Admin gets
// clinic-wide agenda defaults/notifications/regional preferences; Dentist
// gets personal Ausencias + notification preferences only — never clinic
// identity/team (Clínica) or subscription/billing (Mi Suscripción). UI/UX
// only, mock data.
export default function ConfiguracionPage() {
  return (
    <AppShell activeNavLabel="Configuración" heading="Configuración" allowedRoles={["clinic-admin", "dentist"]}>
      <ConfiguracionScreen />
    </AppShell>
  );
}
