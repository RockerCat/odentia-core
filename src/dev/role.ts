// DEV TOOL — everything in src/dev/ exists only to speed up UI review
// across roles during development. Safe to delete this whole folder
// (and its two integration points, greppable via "DEV TOOL") once the
// real auth/permissions system lands.

import { NAV_ITEMS, type NavItem } from "@/components/shell/nav-items";
import {
  BuildingIcon,
  CreditCardIcon,
  DashboardIcon,
  SlidersIcon,
  StoreIcon,
  UsersIcon,
} from "@/components/shell/icons";

export type Role = "superadmin" | "clinic-admin" | "dentist" | "assistant" | "patient";

export const ROLES: Role[] = ["superadmin", "clinic-admin", "dentist", "assistant", "patient"];

export const DEFAULT_ROLE: Role = "clinic-admin";

// The mock dentist this dev role-switcher impersonates whenever Role =
// Odontólogo — matches DENTISTS[0].id in mock-data.ts. Hardcoded (rather
// than imported) since src/dev/ is a disposable dev shim with no access to
// feature mock data (see file header).
export const DEV_DENTIST_ID = "d1";

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  "clinic-admin": "Administrador de Clínica",
  dentist: "Odontólogo",
  assistant: "Asistente",
  patient: "Paciente",
};

// Where a redirect should land whoever's actually logged in — used both by
// /login after picking a demo profile and by the route guard (see
// src/components/shell/use-route-guard.ts) when a role tries a page it
// isn't allowed on.
export function homeRouteForRole(role: Role): string {
  switch (role) {
    case "superadmin":
      return "/admin";
    case "patient":
      return "/portal/citas";
    default:
      return "/agenda";
  }
}

// Clinic Admin and Dentist have no separate "Inicio" — Agenda is their
// entry point (see homeRouteForRole below), so NAV_ITEMS itself has no
// Inicio entry and dentist's own ROLE_NAV_ITEMS list doesn't re-add one.
// Assistant still keeps its original "Inicio" experience for now (unchanged
// per this iteration's scope), so it's re-added explicitly just for it.
const HOME_ITEM: NavItem = { label: "Inicio", icon: DashboardIcon, group: "work" };

// Derived from the real Domain Model in CLAUDE.md:
// - Clinic Admin sees everything (today's default nav).
// - Dentist manages their own clinical operation, not the team, clinic
//   administration, or subscription/billing.
// - Assistant supports operations, but not team, clinic-wide settings,
//   subscription/billing, or personal configuration.
// - Superadmin operates the platform, not a single clinic — a distinct set.
export const ROLE_NAV_ITEMS: Record<Role, readonly NavItem[]> = {
  "clinic-admin": NAV_ITEMS,
  // No Inicio for Dentist — Agenda (already first in NAV_ITEMS) is the
  // entry point, matching homeRouteForRole's dentist landing below.
  dentist: NAV_ITEMS.filter((item) => item.label !== "Clínica" && item.label !== "Mi Suscripción"),
  assistant: [
    HOME_ITEM,
    ...NAV_ITEMS.filter(
      (item) =>
        item.label !== "Clínica" &&
        item.label !== "Mi Suscripción" &&
        item.label !== "Configuración",
    ),
  ],
  // Superadmin manages the platform itself, not a clinic's operation —
  // "Marketplace" here is grouped as a plain "Negocio" item (not the
  // "marketplace" group) on purpose: it means marketplace management/
  // activity, not the supply-shopping promo the clinic-facing roles see.
  superadmin: [
    { label: "Inicio", icon: DashboardIcon, group: "platform" },
    { label: "Clínicas", icon: BuildingIcon, group: "platform" },
    { label: "Usuarios", icon: UsersIcon, group: "platform" },
    { label: "Suscripciones", icon: CreditCardIcon, group: "business" },
    { label: "Marketplace", icon: StoreIcon, group: "business" },
    { label: "Configuración", icon: SlidersIcon, group: "admin" },
  ],
  // A Patient's own portal (src/app/portal/) never uses the clinic shell
  // (Sidebar/SidebarNav/BottomTabBar — see AppShell) — it has its own
  // simple nav (see portal-shell.tsx) instead. Empty here only to satisfy
  // Record<Role, ...>; never actually rendered.
  patient: [],
};
