import {
  BarChartIcon,
  CalendarIcon,
  ClipboardIcon,
  DashboardIcon,
  SlidersIcon,
  StoreIcon,
  UserIcon,
  UsersIcon,
} from "./icons";

export const NAV_ITEMS = [
  { label: "Inicio", icon: DashboardIcon },
  { label: "Agenda", icon: CalendarIcon },
  { label: "Pacientes", icon: UserIcon },
  { label: "Historias Clínicas", icon: ClipboardIcon },
  { label: "Reportes", icon: BarChartIcon },
  { label: "Marketplace", icon: StoreIcon },
  { label: "Equipo", icon: UsersIcon },
  { label: "Configuración", icon: SlidersIcon },
] as const;
