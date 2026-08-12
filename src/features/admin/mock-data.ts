import {
  BuildingIcon,
  CalendarIcon,
  ClockIcon,
  CreditCardIcon,
  UserIcon,
  UsersIcon,
} from "@/components/shell/icons";

// Mock-only data for the Superadmin platform dashboard (/admin) — no
// backend yet, see PROJECT_STATUS.md. Superadmin operates Odentia as a
// platform, not a single clinic (see CLAUDE.md Domain Model), so none of
// this reuses the Clinic Admin's dashboard mocks in mock-data.ts.

export const PLATFORM_KPIS = [
  { label: "Clínicas activas", value: "18", icon: BuildingIcon },
  { label: "En prueba", value: "7", icon: ClockIcon },
  { label: "Suscripciones activas", value: "11", icon: CreditCardIcon },
  { label: "Profesionales activos", value: "46", icon: UsersIcon },
];

export const MONTHLY_ACTIVITY = [
  { label: "Citas gestionadas", value: "1.284", icon: CalendarIcon },
  { label: "Pacientes atendidos", value: "863", icon: UserIcon },
  { label: "Profesionales con actividad", value: "32", icon: UsersIcon },
  { label: "Clínicas con actividad reciente", value: "15", icon: BuildingIcon },
];

export const MARKETPLACE_STATS = [
  { label: "Clínicas que compraron en LopaDent", value: "12" },
  { label: "Compras registradas", value: "$8.4 M" },
  { label: "Suscripciones patrocinadas", value: "7" },
  { label: "Beneficios aplicados", value: "$699.300" },
];

export const MARKETPLACE_MESSAGE =
  "7 de 18 clínicas activas obtuvieron beneficios de suscripción mediante sus compras.";

export type ClinicPlanStatus = "active" | "trial" | "payment-issue" | "inactive";

export const PLAN_STATUS_LABELS: Record<ClinicPlanStatus, string> = {
  active: "Activo",
  trial: "En prueba",
  "payment-issue": "Problema de pago",
  inactive: "Inactivo",
};

export const PLAN_STATUS_STYLES: Record<ClinicPlanStatus, string> = {
  active: "border-primary/25 bg-primary/10 text-primary",
  trial: "border-info/25 bg-info/10 text-info",
  "payment-issue": "border-danger/25 bg-danger/10 text-danger",
  inactive: "border-border bg-foreground/[0.04] text-muted-foreground",
};

export type RecentClinic = {
  id: string;
  name: string;
  adminName: string;
  professionals: number;
  patients: number;
  planStatus: ClinicPlanStatus;
  lastActivityLabel: string;
};

export const RECENT_CLINICS: RecentClinic[] = [
  {
    id: "c1",
    name: "Clínica Sonrisa Perfecta",
    adminName: "María Gómez",
    professionals: 3,
    patients: 412,
    planStatus: "active",
    lastActivityLabel: "Hoy, 9:40 a.m.",
  },
  {
    id: "c2",
    name: "OdontoVida",
    adminName: "Carlos Mendieta",
    professionals: 2,
    patients: 198,
    planStatus: "trial",
    lastActivityLabel: "Ayer, 4:15 p.m.",
  },
  {
    id: "c3",
    name: "Clínica Dental Andes",
    adminName: "Luisa Fernanda Ruiz",
    professionals: 5,
    patients: 631,
    planStatus: "payment-issue",
    lastActivityLabel: "Hace 3 días",
  },
  {
    id: "c4",
    name: "Sonrisas del Valle",
    adminName: "Jorge Iván Castaño",
    professionals: 1,
    patients: 87,
    planStatus: "inactive",
    lastActivityLabel: "Hace 2 semanas",
  },
  {
    id: "c5",
    name: "CentroDental Bogotá",
    adminName: "Adriana López",
    professionals: 4,
    patients: 356,
    planStatus: "active",
    lastActivityLabel: "Hoy, 8:05 a.m.",
  },
];

export type AttentionCategory = "trial-ending" | "payment-issue" | "inactive" | "pending-setup";

export const ATTENTION_CATEGORY_LABELS: Record<AttentionCategory, string> = {
  "trial-ending": "Pruebas próximas a vencer",
  "payment-issue": "Problemas de pago",
  inactive: "Clínicas sin actividad",
  "pending-setup": "Configuraciones pendientes",
};

export type AttentionItem = {
  id: string;
  category: AttentionCategory;
  clinicName: string;
  detail: string;
};

export const ATTENTION_ITEMS: AttentionItem[] = [
  { id: "a1", category: "trial-ending", clinicName: "OdontoVida", detail: "Prueba termina en 3 días" },
  { id: "a2", category: "trial-ending", clinicName: "Dental Care Plus", detail: "Prueba termina en 5 días" },
  {
    id: "a3",
    category: "payment-issue",
    clinicName: "Clínica Dental Andes",
    detail: "Pago rechazado hace 2 días",
  },
  { id: "a4", category: "inactive", clinicName: "Sonrisas del Valle", detail: "Sin actividad hace 2 semanas" },
  {
    id: "a5",
    category: "pending-setup",
    clinicName: "Clínica Nueva Vida",
    detail: "Configuración de agenda incompleta",
  },
];
