// Real Supabase-backed identity — separate from the mock session in
// src/features/auth/ (see CLAUDE.md: that folder is reserved for the mock
// login/session until it's fully retired). clinic_memberships only ever
// holds clinic_admin/dentist/assistant (see the membership_role enum in the
// foundation schema migration) — Superadmin real auth is still out of
// scope, so ClinicContext never resolves it. A real Patient identity is a
// SEPARATE resolution entirely (see PatientContext below and
// resolve-patient-context.ts) — a patient is never a clinic_memberships
// row at all (CLAUDE.md Domain Model: "not a clinic team member").
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

// The Patient Portal's own identity — real, resolved entirely from
// patient_user_links (see resolve-patient-context.ts), never from
// clinic_memberships. PatientInfo is deliberately its own type, not a
// reuse of Clinic's own Patient-shaped record from elsewhere — its fields
// come straight off public.patients, the only real "who is this patient"
// record (there is no separate patient_profiles table).
export type PatientInfo = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  documentId: string | null;
  birthDate: string | null;
  clinicId: string;
};

export type PatientClinic = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  phone: string | null;
  status: "active" | "suspended";
};

// See resolve-patient-context.ts for how each status is reached:
// - "not-linked": authenticated, but zero patient_user_links rows for this
//   account — never treated as "pick some patient anyway".
// - "multiple-links": more than one patient_user_links row (the same real
//   person legitimately linked at more than one clinic — patient_user_links
//   caps ONE linked account per patient record, never one patient per
//   account, see that table's own migration comment) — surfaced
//   explicitly, same "never silently pick one" rule ClinicContext's own
//   "multiple-memberships" already follows, no selector UI built yet.
// - "clinic-suspended": the linked patient's own clinic is suspended.
export type PatientContext =
  | { status: "unauthenticated" }
  | { status: "not-linked" }
  | { status: "multiple-links" }
  | { status: "clinic-suspended" }
  | {
      status: "ok";
      profile: Profile;
      patient: PatientInfo;
      clinic: PatientClinic;
    };
