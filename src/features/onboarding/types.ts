// Onboarding wizard (/registro) — form-state shapes shared across its
// steps. Paso 1 (account) is committed to Supabase Auth as soon as it's
// submitted (see account-step.tsx); Paso 2/3 (clinic + role) only become
// real once bootstrap_clinic() runs at the end of Paso 3 (see api.ts).

export type OnboardingStep = 1 | 2 | 3;

export type AccountFormData = {
  firstName: string;
  lastName: string;
  email: string;
  // Only ever held in memory here — never written to localStorage,
  // sessionStorage, or logged. Cleared as soon as supabase.auth.signUp()
  // resolves successfully (see onboarding-wizard.tsx), regardless of
  // whether that signup already returned a session or is pending email
  // confirmation.
  password: string;
  confirmPassword: string;
};

export type ClinicFormData = {
  name: string;
  phone: string;
  legalName: string;
  taxId: string;
  institutionalEmail: string;
};

// Sede principal's location — its own state (not part of ClinicFormData)
// because latitude/longitude have their own lifecycle (set by "Ubicar en
// el mapa" or by dragging the marker, invalidated when the address text
// changes — see clinic-location-picker.tsx). Field names mirror
// bootstrap_clinic()'s own location_* parameters (see api.ts) so the
// mapping at submit time is a straight rename, not a reshaping.
export type ClinicLocationData = {
  locationAddress: string;
  locationCity: string;
  locationState: string;
  // Fixed for now — the onboarding only ever creates a Colombia-based
  // sede principal (see CLAUDE.md domain model / bootstrap_clinic
  // defaults). Kept as a field rather than a hardcoded literal at the
  // call site so a future non-CO clinic only has to change this shape.
  locationCountry: string;
  locationLatitude: number | null;
  locationLongitude: number | null;
};

// Kept separate from ClinicFormData (a plain text-field bag) since a logo
// is a file, not a string. `file`/`previewUrl` only ever hold a local
// preview (see clinic-logo-picker.tsx) — the real upload to Supabase
// Storage happens after bootstrap_clinic() returns a clinic_id (see api.ts
// uploadClinicLogo), since the storage path is <clinic_id>/... and that id
// doesn't exist before then.
export type ClinicLogo = {
  file: File | null;
  // A URL.createObjectURL(file) preview — see onboarding-wizard.tsx for
  // creation/revocation. Never persisted (no base64, no storage) until
  // the real upload at the end of Paso 3.
  previewUrl: string | null;
};

// "admin-dentist" = "Administro la clínica y también atiendo pacientes" →
// bootstrap_clinic(is_dentist = true), which also creates a
// professional_profiles row for this membership (see the "Administrador
// Odontólogo" representation in CLAUDE.md's Domain Model).
// "admin-only" = "Solo administraré la clínica" → is_dentist = false.
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
  legalName: "",
  taxId: "",
  institutionalEmail: "",
};

export const EMPTY_CLINIC_LOCATION: ClinicLocationData = {
  locationAddress: "",
  locationCity: "",
  locationState: "",
  locationCountry: "CO",
  locationLatitude: null,
  locationLongitude: null,
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
