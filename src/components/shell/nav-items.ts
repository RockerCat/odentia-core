import {
  BarChartIcon,
  BuildingIcon,
  CalendarIcon,
  CreditCardIcon,
  SlidersIcon,
  StoreIcon,
  UserIcon,
} from "./icons";

export type NavGroup = "work" | "marketplace" | "admin" | "platform" | "business";

export type NavItem = {
  label: string;
  icon: typeof CalendarIcon;
  group: NavGroup;
  // Most nav items have no real page behind them yet and stay inert
  // buttons (see sidebar-nav.tsx/bottom-tab-bar.tsx) — only set this once
  // a route actually exists.
  href?: string;
};

// The Clinic Admin has no separate "Inicio" screen — Agenda is the
// entry point (see CLAUDE.md Domain Model + src/app/page.tsx redirect).
//
// Grouped into three sections for the sidebar: daily work, the
// Marketplace (visually highlighted on its own), and clinic-wide
// administration. "Clínica" carries all former "Equipo" functionality
// (team, specialties, schedules, rooms, services) under one name — this
// is a naming/organization change only, no functionality was dropped.
export const NAV_ITEMS: NavItem[] = [
  { label: "Agenda", icon: CalendarIcon, group: "work", href: "/agenda" },
  { label: "Pacientes", icon: UserIcon, group: "work", href: "/pacientes" },
  { label: "Reportes", icon: BarChartIcon, group: "work", href: "/reportes" },
  { label: "Marketplace", icon: StoreIcon, group: "marketplace" },
  { label: "Clínica", icon: BuildingIcon, group: "admin", href: "/clinica" },
  { label: "Mi Suscripción", icon: CreditCardIcon, group: "admin", href: "/suscripcion" },
  { label: "Configuración", icon: SlidersIcon, group: "admin" },
];
