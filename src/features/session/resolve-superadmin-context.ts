import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, SuperadminContext } from "./types";

// Single source of truth for "who is this real Supabase user, as a
// platform Superadmin" — the Platform's own counterpart to
// resolve-clinic-context.ts/resolve-patient-context.ts. Used by the real
// /platform gate (src/lib/supabase/proxy.ts), /platform's own
// layout-level second check, and the real /login redirect. Takes an
// already-constructed SupabaseClient so the exact same query logic runs
// unchanged from the browser, a Server Component, or the proxy.
//
// The ONLY source of truth is public.platform_roles (foundation schema +
// RLS migration) — never clinic_memberships, never Supabase
// auth.users.user_metadata (client-settable, never a real authorization
// boundary), never the mock role switcher. platform_roles_select_self_or_
// superadmin (foundation RLS) already lets an authenticated user read
// their OWN row directly, so no elevated privilege is needed here to
// answer "am I a superadmin" — same shape as is_platform_superadmin(),
// the SQL helper several RLS policies already trust, just resolved
// client-side (well, server-side-via-the-real-session) for routing
// instead of inside a policy.
export async function resolveSuperadminContext(supabase: SupabaseClient): Promise<SuperadminContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const { data: roleRow, error: roleError } = await supabase
    .from("platform_roles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (roleError) throw roleError;

  if (!roleRow || roleRow.role !== "superadmin") return { status: "not-superadmin" };

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profileRow) return { status: "unauthenticated" };

  const profile: Profile = {
    id: profileRow.id,
    firstName: profileRow.first_name,
    lastName: profileRow.last_name,
    email: profileRow.email,
    avatarUrl: profileRow.avatar_url,
  };

  return { status: "ok", profile };
}
