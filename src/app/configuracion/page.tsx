import { AppShell } from "@/components/shell/app-shell";
import { fetchTeamMembers, type TeamMember } from "@/features/clinic/data";
import { ConfiguracionScreen } from "@/features/settings/configuracion-screen";
import { fetchTreatments } from "@/features/treatments/data";
import type { Treatment } from "@/features/treatments/data";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Configuración — shared route/nav entry for Clinic Admin and Dentist
// (Assistant has no "Configuración", see nav-items.ts/role.ts), but each
// role sees a distinct screen (see ConfiguracionScreen): Clinic Admin gets
// clinic-wide agenda defaults/notifications/regional preferences plus
// Horario/Ausencias for any odontólogo in the clinic; Dentist gets her own
// Horario/Ausencias + notification preferences only — never clinic
// identity/team (Clínica) or subscription/billing (Mi Suscripción). Still
// UI/UX-only mock data for Agenda defaults/notifications/regional — real
// for Tratamientos (SettingsScreen's own Tratamientos section) and now
// Horario/Ausencias too (see disponibilidad-admin-section.tsx/
// dentist-settings-screen.tsx), all resolved here from the real session
// (never src/dev's mock role), same server-first pattern as /agenda:
// src/lib/supabase/proxy.ts already gates this route on a real, active
// membership.
export default async function ConfiguracionPage() {
  const supabase = await createClient();

  let clinicId: string | null = null;
  let canManageTreatments = false;
  let initialTreatments: Treatment[] = [];
  let professionals: TeamMember[] = [];
  let selfProfessionalProfileId: string | null = null;
  try {
    const context = await resolveClinicContext(supabase);
    if (context.status === "ok") {
      clinicId = context.clinic.id;
      canManageTreatments = context.membership.role === "clinic_admin";
      selfProfessionalProfileId = context.professionalProfile?.id ?? null;
      initialTreatments = await fetchTreatments(supabase, clinicId);
      // Every active clinical professional in the clinic — a real Dentist,
      // or a Clinic Admin who has her own professional_profile (see
      // disponibilidad-admin-section.tsx's own comment) — never an
      // Assistant, which has none. Fetched unconditionally (not gated on
      // role) since DentistSettingsScreen only needs
      // selfProfessionalProfileId, never this full list.
      const members = await fetchTeamMembers(supabase, clinicId);
      professionals = members.filter((m) => m.professionalProfile !== null);
    }
  } catch (error) {
    console.error("[/configuracion] failed to load real Configuración data", error);
  }

  return (
    <AppShell activeNavLabel="Configuración" heading="Configuración" allowedRoles={["clinic-admin", "dentist"]}>
      <ConfiguracionScreen
        clinicId={clinicId}
        initialTreatments={initialTreatments}
        canManageTreatments={canManageTreatments}
        professionals={professionals}
        selfProfessionalProfileId={selfProfessionalProfileId}
      />
    </AppShell>
  );
}
