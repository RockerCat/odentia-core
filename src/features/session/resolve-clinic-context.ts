import type { SupabaseClient } from "@supabase/supabase-js";
import type { Clinic, ClinicContext, Membership, Profile, ProfessionalProfile } from "./types";

// Single source of truth for "who is this real Supabase user, and what's
// their clinic context" — used by the real /login flow, the real route
// guard (see src/lib/supabase/proxy.ts), and the shell's own display
// identity (see src/components/shell/use-shell-identity.ts). Takes an
// already-constructed SupabaseClient so the exact same query logic runs
// unchanged from the browser, a Server Component, or the proxy (see
// @/lib/supabase/{client,server,proxy}.ts) — never duplicated per caller.
export async function resolveClinicContext(supabase: SupabaseClient): Promise<ClinicContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  // clinic_memberships_select_self (see the additive RLS migration) is
  // what makes a suspended/inactive row visible here at all — without it,
  // this would silently return zero rows for a suspended member,
  // indistinguishable from never having onboarded.
  const { data: memberships, error: membershipError } = await supabase
    .from("clinic_memberships")
    .select("id, clinic_id, role, status, clinic:clinics(id, name, slug, logo_url, status)")
    .eq("profile_id", user.id);
  if (membershipError) throw membershipError;

  if (!memberships || memberships.length === 0) return { status: "no-membership" };

  const active = memberships.filter((membership) => membership.status === "active");
  if (active.length === 0) return { status: "membership-inactive" };
  // V1 has no clinic selector UI — surface this explicitly rather than
  // silently picking one (see CLAUDE.md task scope, section 5).
  if (active.length > 1) return { status: "multiple-memberships" };

  const row = active[0];
  const clinicRow = Array.isArray(row.clinic) ? row.clinic[0] : row.clinic;
  // clinics_select_member_or_superadmin requires an ACTIVE membership (see
  // is_clinic_member) — row.status is 'active' here, so this should always
  // resolve; null would mean the clinic row is unexpectedly unreadable.
  if (!clinicRow) return { status: "no-membership" };
  if (clinicRow.status === "suspended") return { status: "clinic-suspended" };

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profileRow) return { status: "unauthenticated" };

  const { data: professionalRow, error: professionalError } = await supabase
    .from("professional_profiles")
    .select("id, active")
    .eq("clinic_membership_id", row.id)
    .maybeSingle();
  if (professionalError) throw professionalError;

  const profile: Profile = {
    id: profileRow.id,
    firstName: profileRow.first_name,
    lastName: profileRow.last_name,
    email: profileRow.email,
    avatarUrl: profileRow.avatar_url,
  };
  const membership: Membership = {
    id: row.id,
    clinicId: row.clinic_id,
    role: row.role,
    status: row.status,
  };
  const clinic: Clinic = {
    id: clinicRow.id,
    name: clinicRow.name,
    slug: clinicRow.slug,
    logoUrl: clinicRow.logo_url,
    status: clinicRow.status,
  };
  const professionalProfile: ProfessionalProfile | null = professionalRow
    ? { id: professionalRow.id, active: professionalRow.active }
    : null;

  return { status: "ok", profile, membership, clinic, professionalProfile };
}
