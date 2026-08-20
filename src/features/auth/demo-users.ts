import { ROLE_LABELS, type Role } from "@/dev/role";
import { SOLO_DENTIST_SCENARIO_LABEL, SOLO_PRACTITIONER_PROFILE } from "@/dev/role-context";
import { DENTISTS } from "@/features/dashboard/mock-data";
import { CURRENT_ASSISTANT, CURRENT_PATIENT, CURRENT_SUPERADMIN, CURRENT_USER } from "@/lib/current-user";

export type DemoUser = {
  role: Role;
  email: string;
  password: string;
  name: string;
  initials: string;
  roleLabel: string;
  contextLabel: string;
  avatar_url?: string;
  // "Administrador Odontólogo Único" demo scenario — see
  // src/dev/role-context.tsx. Always paired with role: "clinic-admin".
  soloDentistClinic?: boolean;
};

const demoDentist = DENTISTS[0];

// Demo-only credentials for the /login screen's "Acceso de demostración" —
// not real auth, just enough to route the manual email/password form to the
// same mock identities the picker offers. Reuses the existing mocks so each
// role keeps its own distinct identity (never María Gómez for everyone).
export const DEMO_USERS: DemoUser[] = [
  {
    role: "clinic-admin",
    email: "admin.demo@odentia.com",
    password: "demo1234",
    name: CURRENT_USER.name,
    initials: CURRENT_USER.initials,
    roleLabel: ROLE_LABELS["clinic-admin"],
    contextLabel: CURRENT_USER.clinicName,
    avatar_url: CURRENT_USER.avatar_url,
  },
  {
    role: "clinic-admin",
    email: "admin-unico.demo@odentia.com",
    password: "demo1234",
    name: CURRENT_USER.name,
    initials: CURRENT_USER.initials,
    roleLabel: SOLO_DENTIST_SCENARIO_LABEL,
    contextLabel: SOLO_PRACTITIONER_PROFILE.specialty,
    avatar_url: CURRENT_USER.avatar_url,
    soloDentistClinic: true,
  },
  {
    role: "dentist",
    email: "odontologo.demo@odentia.com",
    password: "demo1234",
    name: demoDentist.name,
    initials: demoDentist.initials,
    roleLabel: ROLE_LABELS.dentist,
    contextLabel: demoDentist.specialty,
    avatar_url: demoDentist.avatar_url,
  },
  {
    role: "assistant",
    email: "asistente.demo@odentia.com",
    password: "demo1234",
    name: CURRENT_ASSISTANT.name,
    initials: CURRENT_ASSISTANT.initials,
    roleLabel: ROLE_LABELS.assistant,
    contextLabel: CURRENT_ASSISTANT.clinicName,
    avatar_url: CURRENT_ASSISTANT.avatar_url,
  },
  {
    role: "superadmin",
    email: "superadmin.demo@odentia.com",
    password: "demo1234",
    name: CURRENT_SUPERADMIN.name,
    initials: CURRENT_SUPERADMIN.initials,
    roleLabel: ROLE_LABELS.superadmin,
    contextLabel: CURRENT_SUPERADMIN.contextLabel,
    avatar_url: CURRENT_SUPERADMIN.avatar_url,
  },
  {
    role: "patient",
    email: "paciente.demo@odentia.com",
    password: "demo1234",
    name: CURRENT_PATIENT.name,
    initials: CURRENT_PATIENT.initials,
    roleLabel: ROLE_LABELS.patient,
    contextLabel: CURRENT_PATIENT.clinicName,
    avatar_url: CURRENT_PATIENT.avatar_url,
  },
];
