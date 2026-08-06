// DEV TOOL — everything in src/dev/ exists only to speed up UI review
// across roles during development. Safe to delete this whole folder
// (and its two integration points, greppable via "DEV TOOL") once the
// real auth/permissions system lands.

import { NAV_ITEMS, type NavItem } from "@/components/shell/nav-items";
import {
  ClipboardIcon,
  DashboardIcon,
  SlidersIcon,
  StoreIcon,
  UsersIcon,
} from "@/components/shell/icons";

export type Role = "superadmin" | "clinic-admin" | "dentist" | "assistant";

export const ROLES: Role[] = ["superadmin", "clinic-admin", "dentist", "assistant"];

export const DEFAULT_ROLE: Role = "clinic-admin";

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  "clinic-admin": "Administrador del consultorio",
  dentist: "Odontólogo",
  assistant: "Asistente",
};

// Clinic Admin has no separate "Inicio" — Agenda is the entry point, so
// NAV_ITEMS itself no longer has an Inicio entry. Dentist/Assistant still
// keep their original "Inicio" experience for now (unchanged per this
// iteration's scope), so it's re-added explicitly for just those two.
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
  dentist: [
    HOME_ITEM,
    ...NAV_ITEMS.filter((item) => item.label !== "Clínica" && item.label !== "Mi Suscripción"),
  ],
  assistant: [
    HOME_ITEM,
    ...NAV_ITEMS.filter(
      (item) =>
        item.label !== "Clínica" &&
        item.label !== "Mi Suscripción" &&
        item.label !== "Configuración",
    ),
  ],
  superadmin: [
    { label: "Inicio", icon: DashboardIcon, group: "work" },
    { label: "Consultorios", icon: UsersIcon, group: "work" },
    { label: "Planes y Suscripciones", icon: ClipboardIcon, group: "work" },
    { label: "Marketplace", icon: StoreIcon, group: "marketplace" },
    { label: "Operación global", icon: SlidersIcon, group: "admin" },
  ],
};
