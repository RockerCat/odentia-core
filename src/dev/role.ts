// DEV TOOL — everything in src/dev/ exists only to speed up UI review
// across roles during development. Safe to delete this whole folder
// (and its two integration points, greppable via "DEV TOOL") once the
// real auth/permissions system lands.

import { NAV_ITEMS } from "@/components/shell/nav-items";
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

type NavItem = { label: string; icon: typeof DashboardIcon };

// Clinic Admin has no separate "Inicio" — Agenda is the entry point, so
// NAV_ITEMS itself no longer has an Inicio entry. Dentist/Assistant still
// keep their original "Inicio" experience for now (unchanged per this
// iteration's scope), so it's re-added explicitly for just those two.
const HOME_ITEM: NavItem = { label: "Inicio", icon: DashboardIcon };

// Derived from the real Domain Model in CLAUDE.md:
// - Clinic Admin sees everything (today's default nav).
// - Dentist manages their own clinical operation, not the team.
// - Assistant supports operations, but not team or clinic-wide settings.
// - Superadmin operates the platform, not a single clinic — a distinct set.
export const ROLE_NAV_ITEMS: Record<Role, readonly NavItem[]> = {
  "clinic-admin": NAV_ITEMS,
  dentist: [HOME_ITEM, ...NAV_ITEMS.filter((item) => item.label !== "Equipo")],
  assistant: [
    HOME_ITEM,
    ...NAV_ITEMS.filter((item) => item.label !== "Equipo" && item.label !== "Configuración"),
  ],
  superadmin: [
    { label: "Inicio", icon: DashboardIcon },
    { label: "Consultorios", icon: UsersIcon },
    { label: "Planes y Suscripciones", icon: ClipboardIcon },
    { label: "Marketplace", icon: StoreIcon },
    { label: "Operación global", icon: SlidersIcon },
  ],
};
