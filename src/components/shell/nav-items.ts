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
  { label: "Dashboard", icon: DashboardIcon },
  { label: "Schedule", icon: CalendarIcon },
  { label: "Patients", icon: UserIcon },
  { label: "Medical Records", icon: ClipboardIcon },
  { label: "Reports", icon: BarChartIcon },
  { label: "Marketplace", icon: StoreIcon },
  { label: "Team", icon: UsersIcon },
  { label: "Settings", icon: SlidersIcon },
] as const;
