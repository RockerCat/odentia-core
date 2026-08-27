// Shared between the real /login flow (src/app/login/page.tsx) and the
// real route guard (src/lib/supabase/proxy.ts) so the ?motivo= query param
// they both redirect to /acceso-restringido with never drifts apart — see
// src/app/acceso-restringido/page.tsx for where it's read.
export type RestrictedReason = "inactiva" | "suspendida" | "multiple";

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
