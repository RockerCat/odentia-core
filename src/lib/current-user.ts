export type CurrentUser = {
  name: string;
  initials: string;
  clinicName: string;
  email: string;
  phone: string;
  // Intentionally snake_case: mirrors the future backend/DB column name
  // directly (see src/components/user-avatar.tsx).
  avatar_url?: string;
  // Set only if this admin ALSO practices as a dentist — in that case it
  // should match an id already present in DENTISTS. Most Clinic Admins are
  // pure administrators, so never assume this is set (see CLAUDE.md Domain
  // Model: "El Administrador no necesita un segundo rol para atender
  // pacientes" doesn't mean they always do).
  dentistId: string | null;
};

// Mock "session" data standing in for a real authenticated user until
// auth exists. This particular admin doesn't see patients herself.
export const CURRENT_USER: CurrentUser = {
  name: "María Gómez",
  initials: "MG",
  clinicName: "Clínica Sonrisa Perfecta",
  email: "maria.gomez@odentia.com",
  phone: "+57 300 123 9876",
  // Temporary placeholder headshot for development only — swap for a real
  // profile photo URL once the backend integration exists.
  avatar_url: "https://randomuser.me/api/portraits/women/68.jpg",
  dentistId: null,
};

// An Assistant is never a clinical professional and never practices as one
// (see CLAUDE.md Domain Model) — deliberately a separate, smaller mock
// identity from CURRENT_USER, not a stand-in for the Clinic Admin.
export type AssistantUser = {
  name: string;
  initials: string;
  clinicName: string;
  email: string;
  phone: string;
  avatar_url?: string;
};

export const CURRENT_ASSISTANT: AssistantUser = {
  name: "Laura Torres",
  initials: "LT",
  clinicName: "Clínica Sonrisa Perfecta",
  email: "laura.torres@odentia.com",
  phone: "+57 300 456 7890",
  // Temporary placeholder headshot for development only — same mock photo
  // source as CURRENT_USER/DENTISTS above. UserAvatar still falls back to
  // initials ("LT") if this ever fails to load.
  avatar_url: "https://randomuser.me/api/portraits/women/50.jpg",
};

// Superadmin represents the Odentia team, not a single clinic (see CLAUDE.md
// Domain Model) — deliberately its own mock identity, never CURRENT_USER.
export type SuperadminUser = {
  name: string;
  initials: string;
  contextLabel: string;
  email: string;
  phone: string;
  avatar_url?: string;
};

export const CURRENT_SUPERADMIN: SuperadminUser = {
  name: "Mateo Peña",
  initials: "MP",
  contextLabel: "Plataforma Odentia",
  email: "mateo.pena@odentia.com",
  phone: "+57 300 789 1234",
  // Temporary placeholder headshot for development only — same mock photo
  // source as CURRENT_USER/DENTISTS above. UserAvatar still falls back to
  // initials ("MP") if this ever fails to load.
  avatar_url: "https://randomuser.me/api/portraits/men/45.jpg",
};

// A Patient is never clinic staff — its own portal (see src/app/portal/)
// never reuses the clinic dashboard shell (see CLAUDE.md Domain Model).
// Matches the existing "Valeria Muñoz" record in
// src/features/patients/mock-data.ts (id "p11") field-for-field so the
// portal's own appointment history/summary can be derived from the exact
// same WEEK_APPOINTMENTS entries that patient record already resolves to.
export type PatientUser = {
  name: string;
  initials: string;
  age: number;
  documentId: string;
  clinicName: string;
  email: string;
  phone: string;
  avatar_url?: string;
};

export const CURRENT_PATIENT: PatientUser = {
  name: "Valeria Muñoz",
  initials: "VM",
  age: 26,
  documentId: "CC 1.018.334.552",
  // Just the clinic's own name, not prefixed with "Clínica" — this is the
  // proper-name value shown throughout the Patient portal (nav, header,
  // "Datos de la cita", Mi perfil); the word "Clínica" only ever appears
  // separately as a field label there (e.g. dt "Clínica" / dd "Sonrisa
  // Perfecta"), never baked into the name itself.
  clinicName: "Sonrisa Perfecta",
  email: "valeria.munoz@gmail.com",
  phone: "+57 300 887 6612",
  avatar_url: "https://randomuser.me/api/portraits/women/72.jpg",
};
