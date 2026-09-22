// Form-state shapes shared by the account/clinic form pieces still in
// real use — AccountFormData by /invitacion/[token]'s own traditional
// AccountStep branch; ClinicFormData/ClinicLocationData/ClinicLogo by
// Platform's own clinic provisioning (src/features/platform/clinic-form.tsx).
// "Odentia — retirar self-service de /registro y eliminar Confirm
// Signup" (2026-09-21) removed the role-only shapes (RoleFormData/
// WorkMode/AppointmentDuration/EMPTY_ROLE) that only ever existed for
// /registro's own retired Paso 3 — do not reintroduce them here without a
// real caller.

export type AccountFormData = {
  firstName: string;
  lastName: string;
  email: string;
  // Only ever held in memory here — never written to localStorage,
  // sessionStorage, or logged. Cleared as soon as supabase.auth.signUp()
  // resolves successfully (see /invitacion/[token]/page.tsx's own
  // handleSignUp), regardless of whether that signup already returned a
  // session or is pending email confirmation.
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
// provision_clinic()'s own location_* parameters (see
// src/features/platform/api.ts) so the mapping at submit time is a
// straight rename, not a reshaping.
export type ClinicLocationData = {
  locationAddress: string;
  locationCity: string;
  locationState: string;
  // Fixed for now — Odentia only ever provisions a Colombia-based sede
  // principal. Kept as a field rather than a hardcoded literal at the
  // call site so a future non-CO clinic only has to change this shape.
  locationCountry: string;
  locationLatitude: number | null;
  locationLongitude: number | null;
};

// Kept separate from ClinicFormData (a plain text-field bag) since a logo
// is a file, not a string. `file`/`previewUrl` only ever hold a local
// preview (see clinic-logo-picker.tsx) — the real upload to Supabase
// Storage happens once a real clinic_id exists (see
// src/features/clinic/logo.ts's own uploadClinicLogo(), shared by
// Platform's clinic-form.tsx), since the storage path is
// <clinic_id>/... and that id doesn't exist before then.
export type ClinicLogo = {
  file: File | null;
  // A URL.createObjectURL(file) preview — created/revoked by whichever
  // screen owns this state (see clinic-form.tsx). Never persisted (no
  // base64, no storage) until the real upload.
  previewUrl: string | null;
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

export const EMPTY_CLINIC_LOGO: ClinicLogo = {
  file: null,
  previewUrl: null,
};
