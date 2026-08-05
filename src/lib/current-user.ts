export type CurrentUser = {
  name: string;
  initials: string;
  clinicName: string;
  photoUrl?: string;
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
  dentistId: null,
};
