"use client";

import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import type { Treatment } from "@/features/treatments/data";
import { DentistSettingsScreen } from "./dentist-settings-screen";
import { SettingsScreen } from "./settings-screen";

// Configuración means something different per role (see CLAUDE.md Domain
// Model: Clinic Admin gets clinic-wide operational settings, Dentist gets
// personal settings only — Assistant has no "Configuración" at all, see
// nav-items.ts/role.ts). Same nav entry/route/heading for both roles, but
// entirely distinct screens — this just picks the right one.
//
// clinicId/initialTreatments/canManageTreatments are the one real slice
// threaded through this otherwise-mock screen (see src/app/configuracion/
// page.tsx and SettingsScreen's own Tratamientos section) — passed through
// unconditionally; SettingsScreen/TratamientosSection are what actually
// gate on canManageTreatments, never this component's own (mock) role
// switch above.
export function ConfiguracionScreen({
  clinicId,
  initialTreatments,
  canManageTreatments,
}: {
  clinicId: string | null;
  initialTreatments: Treatment[];
  canManageTreatments: boolean;
}) {
  const { role } = useRole();
  return role === "dentist" ? (
    <DentistSettingsScreen />
  ) : (
    <SettingsScreen clinicId={clinicId} initialTreatments={initialTreatments} canManageTreatments={canManageTreatments} />
  );
}
