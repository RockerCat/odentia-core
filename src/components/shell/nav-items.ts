import {
  BarChartIcon,
  BuildingIcon,
  CalendarIcon,
  CreditCardIcon,
  SlidersIcon,
  StoreIcon,
  UserIcon,
} from "./icons";

export type NavGroup = "work" | "marketplace" | "admin";

export type NavItem = {
  label: string;
  icon: typeof CalendarIcon;
  group: NavGroup;
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
  { label: "Agenda", icon: CalendarIcon, group: "work" },
  { label: "Pacientes", icon: UserIcon, group: "work" },
  { label: "Reportes", icon: BarChartIcon, group: "work" },
  { label: "Marketplace", icon: StoreIcon, group: "marketplace" },
  { label: "Clínica", icon: BuildingIcon, group: "admin" },
  { label: "Mi Suscripción", icon: CreditCardIcon, group: "admin" },
  { label: "Configuración", icon: SlidersIcon, group: "admin" },
];

// The mobile bottom tab bar only has room for 5 items. "Mi Suscripción"
// and "Configuración" move into the mobile user menu instead (see
// MobileHeader). Derived from NAV_ITEMS so icons/order stay in sync with
// the desktop sidebar's single source of truth.
const MOBILE_TAB_LABELS = ["Agenda", "Pacientes", "Reportes", "Marketplace", "Clínica"];

export const MOBILE_TAB_ITEMS: NavItem[] = NAV_ITEMS.filter((item) =>
  MOBILE_TAB_LABELS.includes(item.label),
);
