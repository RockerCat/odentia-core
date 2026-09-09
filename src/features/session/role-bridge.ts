import { clearSession, writeSession } from "@/features/auth/session";
import type { Role } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import type { ClinicContext, MembershipRole, PatientContext } from "./types";

// Bridges a resolved REAL clinic context into the existing mock session
// (src/features/auth/session.ts) that RoleProvider/useAuthenticatedIdentity
// — and ~17 feature screens (Agenda, Pacientes, Reportes, Clínica,
// Configuración; see CLAUDE.md task scope, section 15) — still read for
// role-based mock data. This is a deliberate, temporary bridge: those
// screens keep working completely unmodified, now driven by the REAL
// membership role instead of a manually-picked demo one, until they're
// migrated off mock data per-vertical. The mock session is never the
// source of truth for whether someone is authenticated — that's the real
// Supabase session, enforced in src/lib/supabase/proxy.ts.
const MEMBERSHIP_ROLE_TO_MOCK_ROLE: Record<MembershipRole, Role> = {
  clinic_admin: "clinic-admin",
  dentist: "dentist",
  assistant: "assistant",
};

export function bridgeClinicContextIntoMockSession(context: Extract<ClinicContext, { status: "ok" }>): void {
  const role = MEMBERSHIP_ROLE_TO_MOCK_ROLE[context.membership.role];
  // "Administrador Odontólogo Único" (see src/dev/role-context.tsx) is the
  // mock's stand-in for "this Clinic Admin also has a professional_profile"
  // — exactly the real-world distinction CLAUDE.md's task scope (section 6)
  // asks for (Admin puro vs Admin Odontólogo). Only meaningful for
  // clinic_admin; a real dentist/assistant already gets their own branch in
  // use-authenticated-identity.ts regardless of this flag.
  const soloDentistClinic = role === "clinic-admin" && context.professionalProfile !== null;
  writeSession({ role, soloDentistClinic });
}

// Same bridge, for a real Patient — the Portal's own ~6 screens still read
// the mock session ONLY through useRouteGuard(["patient"]) (see
// components/shell/use-route-guard.ts, shared with AppShell's own gate);
// no Portal screen reads useRole() for identity/data (see
// portal-shell.tsx's own real usePatientContext() for that), so this is
// deliberately narrower than bridgeClinicContextIntoMockSession above —
// just enough for that one shared gate to keep recognizing a real Patient
// as "role: patient", nothing else rides along.
// Kept as a (currently unused) parameter for API symmetry with
// bridgeClinicContextIntoMockSession above — nothing per-patient rides
// along the mock session yet, only the role itself.
export function bridgePatientContextIntoMockSession(_context: Extract<PatientContext, { status: "ok" }>): void {
  writeSession({ role: "patient" });
}

export function clearBridgedMockSession(): void {
  clearSession();
}

// Shared by /login's own form submit AND use-route-guard.ts's self-heal
// (see that file's own comment on why a self-heal exists at all) so the
// "which bridge applies" selection never drifts between the two call
// sites. Clinic wins over Patient when (in theory) both could resolve —
// matches decideAuthenticatedRedirect's own priority for the same pair.
export function bridgeAuthenticatedContext(clinicContext: ClinicContext, patientContext: PatientContext): void {
  if (clinicContext.status === "ok") bridgeClinicContextIntoMockSession(clinicContext);
  else if (patientContext.status === "ok") bridgePatientContextIntoMockSession(patientContext);
}
