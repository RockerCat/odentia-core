import { clearSession, writeSession } from "@/features/auth/session";
import type { Role } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import type { ClinicContext, MembershipRole } from "./types";

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

export function clearBridgedMockSession(): void {
  clearSession();
}
