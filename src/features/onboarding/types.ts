// Onboarding wizard (/registro) — mock-only state shared across its 3 steps.
// Nothing here is persisted; it lives in OnboardingWizard's useState and is
// gone the moment the flow is abandoned (see task scope: no backend, no
// localStorage for this data — unlike the demo session in
// src/features/auth/session.ts, which this flow only writes to once, at
// the very end, via writeSession).

export type OnboardingStep = 1 | 2 | 3;

export type AccountFormData = {
  firstName: string;
  lastName: string;
  email: string;
  // Only ever held in memory here — never written to localStorage,
  // sessionStorage, or any mock. Cleared once the mock "Crear mi clínica"
  // step finishes (see onboarding-wizard.tsx).
  password: string;
  confirmPassword: string;
};

export type ClinicFormData = {
  name: string;
  phone: string;
  city: string;
  department: string;
  address: string;
  legalName: string;
  taxId: string;
  institutionalEmail: string;
};

// Kept separate from ClinicFormData (a plain text-field bag) since a logo is
// a file, not a string — this shape is what later gets swapped in `main`:
// `file`/`previewUrl` (local preview) give way to an uploaded
// `clinics.logo_url`, without the step UI needing to change.
export type ClinicLogo = {
  file: File | null;
  // A URL.createObjectURL(file) preview — see onboarding-wizard.tsx for
  // creation/revocation. Never persisted (no base64, no storage).
  previewUrl: string | null;
};

// "admin-dentist" = "Administro la clínica y también atiendo pacientes",
// mapped to the existing soloDentistClinic scenario (role-context.tsx).
// "admin-only" = "Solo administraré la clínica", plain clinic-admin.
export type WorkMode = "admin-dentist" | "admin-only";

export type AppointmentDuration = "15" | "30" | "45" | "60";

export type RoleFormData = {
  workMode: WorkMode | null;
  registrationNumber: string;
  appointmentDuration: AppointmentDuration;
};

export const EMPTY_ACCOUNT: AccountFormData = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export const EMPTY_CLINIC: ClinicFormData = {
  name: "",
  phone: "",
  city: "",
  department: "",
  address: "",
  legalName: "",
  taxId: "",
  institutionalEmail: "",
};

export const EMPTY_ROLE: RoleFormData = {
  workMode: null,
  registrationNumber: "",
  appointmentDuration: "30",
};

export const EMPTY_CLINIC_LOGO: ClinicLogo = {
  file: null,
  previewUrl: null,
};
