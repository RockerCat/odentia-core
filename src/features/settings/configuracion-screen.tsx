"use client";

import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import type { TeamMember } from "@/features/clinic/data";
import type { Treatment } from "@/features/treatments/data";
import { DentistSettingsScreen } from "./dentist-settings-screen";
import { SettingsScreen } from "./settings-screen";

// Configuración means something different per role (see CLAUDE.md Domain
// Model: Clinic Admin gets clinic-wide operational settings, Dentist gets
// personal settings only — Assistant has no "Configuración" at all, see
// nav-items.ts/role.ts). Same nav entry/route/heading for both roles, but
// entirely distinct screens — this just picks the right one.
//
// clinicId/initialTreatments/canManageTreatments/professionals/
// selfProfessionalProfileId are the real slices threaded through this
// otherwise-partly-mock screen (see src/app/configuracion/page.tsx) —
// passed through unconditionally; the two screens below are what actually
// gate/scope on them, never this component's own (mock, but real-role-
// bridged — see role-bridge.ts) role switch above.
export function ConfiguracionScreen({
  clinicId,
  initialTreatments,
  canManageTreatments,
  professionals,
  selfProfessionalProfileId,
}: {
  clinicId: string | null;
  initialTreatments: Treatment[];
  canManageTreatments: boolean;
  professionals: TeamMember[];
  selfProfessionalProfileId: string | null;
}) {
  const { role } = useRole();
  return role === "dentist" ? (
    <DentistSettingsScreen clinicId={clinicId} professionalProfileId={selfProfessionalProfileId} />
  ) : (
    <SettingsScreen
      clinicId={clinicId}
      initialTreatments={initialTreatments}
      canManageTreatments={canManageTreatments}
      professionals={professionals}
    />
  );
}
