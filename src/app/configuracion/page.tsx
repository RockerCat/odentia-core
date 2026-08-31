import { AppShell } from "@/components/shell/app-shell";
import { ConfiguracionScreen } from "@/features/settings/configuracion-screen";
import { fetchTreatments } from "@/features/treatments/data";
import type { Treatment } from "@/features/treatments/data";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Configuración — shared route/nav entry for Clinic Admin and Dentist
// (Assistant has no "Configuración", see nav-items.ts/role.ts), but each
// role sees a distinct screen (see ConfiguracionScreen): Clinic Admin gets
// clinic-wide agenda defaults/notifications/regional preferences; Dentist
// gets personal Ausencias + notification preferences only — never clinic
// identity/team (Clínica) or subscription/billing (Mi Suscripción). Still
// UI/UX-only mock data for everything EXCEPT Tratamientos (see
// SettingsScreen's own Tratamientos section) — that one slice is real,
// resolved here from the real session (never src/dev's mock role), same
// server-first pattern as /agenda: src/lib/supabase/proxy.ts already gates
// this route on a real, active membership.
export default async function ConfiguracionPage() {
  const supabase = await createClient();

  let clinicId: string | null = null;
  let canManageTreatments = false;
  let initialTreatments: Treatment[] = [];
  try {
    const context = await resolveClinicContext(supabase);
    if (context.status === "ok") {
      clinicId = context.clinic.id;
      canManageTreatments = context.membership.role === "clinic_admin";
      initialTreatments = await fetchTreatments(supabase, clinicId);
    }
  } catch (error) {
    console.error("[/configuracion] failed to load real Tratamientos data", error);
  }

  return (
    <AppShell activeNavLabel="Configuración" heading="Configuración" allowedRoles={["clinic-admin", "dentist"]}>
      <ConfiguracionScreen clinicId={clinicId} initialTreatments={initialTreatments} canManageTreatments={canManageTreatments} />
    </AppShell>
  );
}
