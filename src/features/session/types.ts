// Real Supabase-backed identity — separate from the mock session in
// src/features/auth/ (see CLAUDE.md: that folder is reserved for the mock
// login/session until it's fully retired). clinic_memberships only ever
// holds clinic_admin/dentist/assistant (see the membership_role enum in the
// foundation schema migration) — Patient and Superadmin real auth are both
// out of this task's scope, so ClinicContext never resolves those.
export type MembershipRole = "clinic_admin" | "dentist" | "assistant";

export type Profile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

export type Membership = {
  id: string;
  clinicId: string;
  role: MembershipRole;
  status: "active" | "suspended" | "inactive";
};

export type Clinic = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: "active" | "suspended";
};

export type ProfessionalProfile = {
  id: string;
  active: boolean;
};

// See resolve-clinic-context.ts for how each status is reached, and
// CLAUDE.md's task scope (sections 5/13) for what each one means:
// - "no-membership": never onboarded, or the only membership row is fully
//   invisible under RLS (see the clinic_memberships_select_self migration).
// - "membership-inactive": the membership row itself is visible (self-
//   select) but not status 'active'.
// - "clinic-suspended": membership is active, but the clinic itself is
//   suspended.
// - "multiple-memberships": more than one active membership — V1 has no
//   selector UI yet (see role-bridge.ts / login/page.tsx), so this is
//   surfaced explicitly rather than silently picking one.
export type ClinicContext =
  | { status: "unauthenticated" }
  | { status: "no-membership" }
  | { status: "membership-inactive" }
  | { status: "clinic-suspended" }
  | { status: "multiple-memberships" }
  | {
      status: "ok";
      profile: Profile;
      membership: Membership;
      clinic: Clinic;
      professionalProfile: ProfessionalProfile | null;
    };
