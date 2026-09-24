// Clinic description ("Sobre nosotros" in /portal/clinica) — optional,
// edited from Clínica → Información general. The 500 limit mirrors the DB's
// own clinics_description_length_check (migration 20260924170000), which is
// the real enforcement; blank text is stored as NULL so "no description"
// has exactly one representation and the Portal hides the section.
export const CLINIC_DESCRIPTION_MAX_LENGTH = 500;

export function normalizeClinicDescription(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
