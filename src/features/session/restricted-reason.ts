// Shared between the real /login flow (src/app/login/page.tsx) and the
// real route guard (src/lib/supabase/proxy.ts) so the ?motivo= query param
// they both redirect to /acceso-restringido with never drifts apart — see
// src/app/acceso-restringido/page.tsx for where it's read.
export type RestrictedReason = "inactiva" | "suspendida" | "multiple" | "paciente-no-vinculado" | "paciente-multiple";

export function restrictedReasonFor(
  status: "membership-inactive" | "clinic-suspended" | "multiple-memberships",
): RestrictedReason {
  switch (status) {
    case "membership-inactive":
      return "inactiva";
    case "clinic-suspended":
      return "suspendida";
    case "multiple-memberships":
      return "multiple";
  }
}

// Patient Portal's own counterpart — see resolve-patient-context.ts's
// PatientContext. "clinic-suspended" reuses the staff-facing "suspendida"
// reason as-is (same real-world meaning, no separate copy needed). Used by
// two different call sites with two different scopes, deliberately:
// src/lib/supabase/proxy.ts's /portal/* gate uses all three statuses
// (an authenticated visitor trying to REACH the Portal with no link at all
// gets the honest "cuenta no vinculada" screen, never a silent bounce
// elsewhere); decide-authenticated-redirect.ts (the shared /login-already-
// authenticated decision) deliberately does NOT escalate a bare
// "not-linked" the same way — that path also covers a brand-new staff
// founder mid-onboarding with neither a clinic membership nor a patient
// link yet, for whom /registro (not this screen) is still the right
// default; only an AMBIGUOUS or blocked patient state (several links, or a
// suspended clinic) escalates there too.
export function restrictedReasonForPatient(status: "not-linked" | "multiple-links" | "clinic-suspended"): RestrictedReason {
  switch (status) {
    case "not-linked":
      return "paciente-no-vinculado";
    case "multiple-links":
      return "paciente-multiple";
    case "clinic-suspended":
      return "suspendida";
  }
}
