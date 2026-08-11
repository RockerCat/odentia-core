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

// No avatar_url on purpose — UserAvatar already falls back to initials
// ("LT") when it's absent, matching "usa iniciales por ahora" without
// generating a placeholder image.
export const CURRENT_ASSISTANT: AssistantUser = {
  name: "Laura Torres",
  initials: "LT",
  clinicName: "Clínica Sonrisa Perfecta",
  email: "laura.torres@odentia.com",
  phone: "+57 300 456 7890",
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
};
