import type { ClinicContext } from "@/features/session/types";

// Mirrors public.is_active_clinical_professional(uuid) exactly (see the
// patient_medical_histories migration) — the RPC is the real enforcement
// boundary, this is only for deciding what the UI shows/enables. clinic_admin
// is never treated as a synonym for dentist (see CLAUDE.md task scope,
// section 13): both roles need their OWN active professional_profile,
// never just the role name. Centralized here so Odontograma/Atenciones/
// Documentos can reuse the exact same rule later instead of duplicating it
// per component (see task scope, section 12).
export function canEditClinicalData(context: ClinicContext): boolean {
  if (context.status !== "ok") return false;
  const eligibleRole = context.membership.role === "dentist" || context.membership.role === "clinic_admin";
  return eligibleRole && context.professionalProfile?.active === true;
}
