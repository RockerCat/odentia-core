// /demo's Prospecto Comercial form — see actions.ts for the real write
// path (submit_commercial_prospect()). A Prospecto is deliberately NOT
// any Odentia identity entity (no Auth user, no profile, no clinic, no
// membership, no invitation — see CLAUDE.md Domain Model), so this shape
// stays a plain, minimal contact-form bag, unrelated to
// onboarding/types.ts's AccountFormData/ClinicFormData.
export type CommercialProspectFormData = {
  firstName: string;
  lastName: string;
  clinicName: string;
  email: string;
  phone: string;
  city: string;
};

export const EMPTY_COMMERCIAL_PROSPECT: CommercialProspectFormData = {
  firstName: "",
  lastName: "",
  clinicName: "",
  email: "",
  phone: "",
  city: "",
};
