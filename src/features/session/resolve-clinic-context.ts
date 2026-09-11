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
  if (!user) {
    console.log("[resolveClinicContext:debug] result.status =", "unauthenticated (no user)");
    return { status: "unauthenticated" };
  }
  // TEMPORARY DEBUG — PROMPT NINJA "Instrumentar temporalmente
  // resolveClinicContext". Never email/tokens/PII, only the id.
  console.log("[resolveClinicContext:debug] user.id =", user.id);

  // clinic_memberships_select_self (see the additive RLS migration) is
  // what makes a suspended/inactive row visible here at all — without it,
  // this would silently return zero rows for a suspended member,
  // indistinguishable from never having onboarded.
  const { data: memberships, error: membershipError } = await supabase
    .from("clinic_memberships")
    .select("id, clinic_id, role, status, clinic:clinics(id, name, slug, logo_url, status)")
    .eq("profile_id", user.id);
  // TEMPORARY DEBUG
  console.log("[resolveClinicContext:debug] clinic_memberships query", {
    errorCode: membershipError?.code ?? null,
    errorMessage: membershipError?.message ?? null,
    rowCount: memberships?.length ?? 0,
    rows: (memberships ?? []).map((m) => ({
      membershipId: m.id,
      clinicId: m.clinic_id,
      role: m.role,
      status: m.status,
      clinicResolved: Boolean(Array.isArray(m.clinic) ? m.clinic[0] : m.clinic),
    })),
  });
  if (membershipError) throw membershipError;

  if (!memberships || memberships.length === 0) {
    console.log("[resolveClinicContext:debug] result.status =", "no-membership (zero rows)");
    return { status: "no-membership" };
  }

  const active = memberships.filter((membership) => membership.status === "active");
  // TEMPORARY DEBUG
  console.log("[resolveClinicContext:debug] active membership found?", active.length > 0, "| count:", active.length);
  if (active.length === 0) {
    console.log("[resolveClinicContext:debug] result.status =", "membership-inactive");
    return { status: "membership-inactive" };
  }
  // V1 has no clinic selector UI — surface this explicitly rather than
  // silently picking one (see CLAUDE.md task scope, section 5).
  if (active.length > 1) {
    console.log("[resolveClinicContext:debug] result.status =", "multiple-memberships");
    return { status: "multiple-memberships" };
  }

  const row = active[0];
  const clinicRow = Array.isArray(row.clinic) ? row.clinic[0] : row.clinic;
  // TEMPORARY DEBUG
  console.log("[resolveClinicContext:debug] clinicRow resolved?", Boolean(clinicRow));
  // clinics_select_member_or_superadmin requires an ACTIVE membership (see
  // is_clinic_member) — row.status is 'active' here, so this should always
  // resolve; null would mean the clinic row is unexpectedly unreadable.
  if (!clinicRow) {
    console.log("[resolveClinicContext:debug] result.status =", "no-membership (clinicRow null — embedded clinics unreadable)");
    return { status: "no-membership" };
  }
  if (clinicRow.status === "suspended") {
    console.log("[resolveClinicContext:debug] result.status =", "clinic-suspended");
    return { status: "clinic-suspended" };
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profileRow) {
    console.log("[resolveClinicContext:debug] result.status =", "unauthenticated (no profiles row)");
    return { status: "unauthenticated" };
  }

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

  // TEMPORARY DEBUG
  console.log("[resolveClinicContext:debug] result.status =", "ok");
  return { status: "ok", profile, membership, clinic, professionalProfile };
}
