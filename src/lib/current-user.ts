export type CurrentUser = {
  name: string;
  initials: string;
  clinicName: string;
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
  // Temporary placeholder headshot for development only — swap for a real
  // profile photo URL once the backend integration exists.
  avatar_url: "https://randomuser.me/api/portraits/women/68.jpg",
  dentistId: null,
};
