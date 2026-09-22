// Single source of truth for turning (clinics.status, clinics.trial_ends_at)
// into a display label — used by both Mi Suscripción (Clinic Admin) and
// Platform's own clinic detail, so the two screens can never disagree
// about what "trialing" means. Deliberately NOT a new persisted status:
// public.clinic_status only ever has 'active'/'suspended' (foundation
// schema) — this function derives "trial" / "trial_expired" purely from
// trial_ends_at vs. now(), never a third enum value written to the DB.
//
// "Can this clinic currently use Odentia?" (the actual entitlement gate)
// already exists and is centralized in src/features/session/
// resolve-clinic-context.ts / resolve-patient-context.ts (both check
// clinics.status === 'suspended') — Auth is out of scope for this
// checkpoint, so that logic is deliberately left untouched here, not
// duplicated.
export type ClinicCommercialStatusRow = {
  status: "active" | "suspended";
  trialEndsAt: string | null;
};

export type ClinicCommercialLabel = "trial" | "trial_expired" | "active" | "suspended";

export function deriveClinicCommercialLabel(row: ClinicCommercialStatusRow, now: Date = new Date()): ClinicCommercialLabel {
  if (row.status === "suspended") return "suspended";
  if (!row.trialEndsAt) return "active";
  return new Date(row.trialEndsAt) > now ? "trial" : "trial_expired";
}
