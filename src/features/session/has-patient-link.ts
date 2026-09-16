import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal Marketplace-SSO-specific question: "is this authenticated
// profile linked to at least one patient record, regardless of how many
// or which clinic?" — deliberately NOT resolvePatientContext(), which
// fails closed on more than one patient_user_links row because THAT
// resolver needs to pick exactly one clinic to display in the Patient
// Portal. Marketplace never selects or transports a clinic for a Patient
// buyer at all (see the buyer-identity/clinic-attribution audit), so that
// ambiguity is irrelevant here — any number of links, including several,
// is a valid "yes." Never touches resolvePatientContext()'s own behavior
// or invariants; this is a separate, narrower question asked directly.
export async function hasAnyPatientLink(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // patient_user_links_select_self (foundation RLS) scopes this to the
  // caller's own profile_id already — the same RLS policy resolve-
  // patient-context.ts's own query relies on.
  const { count, error } = await supabase
    .from("patient_user_links")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id);
  if (error) throw error;

  return (count ?? 0) > 0;
}
