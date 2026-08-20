"use client";

import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { DentistSettingsScreen } from "./dentist-settings-screen";
import { SettingsScreen } from "./settings-screen";

// Configuración means something different per role (see CLAUDE.md Domain
// Model: Clinic Admin gets clinic-wide operational settings, Dentist gets
// personal settings only — Assistant has no "Configuración" at all, see
// nav-items.ts/role.ts). Same nav entry/route/heading for both roles, but
// entirely distinct screens — this just picks the right one.
export function ConfiguracionScreen() {
  const { role } = useRole();
  return role === "dentist" ? <DentistSettingsScreen /> : <SettingsScreen />;
}
