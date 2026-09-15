import {
  BarChartIcon,
  BuildingIcon,
  CalendarIcon,
  CreditCardIcon,
  FlagIcon,
  SlidersIcon,
  StoreIcon,
  UserIcon,
} from "./icons";

export type NavGroup = "work" | "marketplace" | "admin" | "platform" | "business";

// Marketplace is an independent product (see CLAUDE.md) — every clinic-facing
// access to it is an external link, never an internal route. Every real
// entry point must start the SSO flow (see src/app/marketplace/entrar/
// route.ts), never a direct link into Marketplace's own UI — this is
// Marketplace's own /auth/sso/start, which redirects the browser on to
// Core's authenticated entry point and back.
//
// Deliberately still a plain literal, not process.env.MARKETPLACE_URL:
// this module is imported by client components (bottom-tab-bar.tsx,
// sidebar-nav.tsx via role.ts, marketplace-card.tsx), and that env var is
// intentionally server-only (no NEXT_PUBLIC_ prefix — see
// src/app/marketplace/entrar/route.ts's own comment), so it isn't
// readable here at all. The literal base URL matches that same env var's
// real (non-secret) production value.
export const MARKETPLACE_URL = "https://marketplace.odentia.co/auth/sso/start";

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
  { label: "Marketplace", icon: StoreIcon, group: "marketplace", href: MARKETPLACE_URL },
  { label: "Clínica", icon: BuildingIcon, group: "admin", href: "/clinica" },
  // RIPS #5 — Admin Clínica only (see src/dev/role.ts's own exclusions
  // for dentist/assistant, and the route's own AppShell allowedRoles).
  { label: "RIPS", icon: FlagIcon, group: "admin", href: "/rips" },
  { label: "Mi Suscripción", icon: CreditCardIcon, group: "admin", href: "/suscripcion" },
  { label: "Configuración", icon: SlidersIcon, group: "admin", href: "/configuracion" },
];
