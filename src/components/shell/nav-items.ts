import {
  BarChartIcon,
  CalendarIcon,
  ClipboardIcon,
  SlidersIcon,
  StoreIcon,
  UserIcon,
  UsersIcon,
} from "./icons";

// The Clinic Admin has no separate "Inicio" screen — Agenda is the
// entry point (see CLAUDE.md Domain Model + src/app/page.tsx redirect).
export const NAV_ITEMS = [
  { label: "Agenda", icon: CalendarIcon },
  { label: "Pacientes", icon: UserIcon },
  { label: "Historias Clínicas", icon: ClipboardIcon },
  { label: "Reportes", icon: BarChartIcon },
  { label: "Marketplace", icon: StoreIcon },
  { label: "Equipo", icon: UsersIcon },
  { label: "Configuración", icon: SlidersIcon },
] as const;
