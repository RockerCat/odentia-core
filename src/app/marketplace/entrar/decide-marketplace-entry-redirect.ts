import { decideClinicRedirect } from "@/lib/supabase/proxy";
import type { ClinicContext } from "@/features/session/types";

// The one gating decision route.ts needs before ever attempting
// issue_marketplace_sso_code(): does this visitor get to proceed at all?
// Pulled out as a pure function (same convention as decideClinicRedirect/
// isValidState/isCanonicalCallback in this exact area) so it's directly
// unit-testable without mocking Supabase or a live RPC call.
//
// Two ways to proceed (return null, meaning "no redirect, let the route
// attempt issuance"): a real clinic member (clinicContext.status === "ok",
// unchanged from before Patient support existed), or a real Patient with
// no clinic membership (isMarketplaceEligiblePatient — see
// has-patient-link.ts's own comment on why this is a narrower, more
// permissive question than the Patient Portal's own resolvePatientContext()
// check). Every other case falls through to the exact same
// decideClinicRedirect() decision every other private route already uses
// — never a different/weaker version of it.
export function decideMarketplaceEntryRedirect(
  clinicContext: ClinicContext,
  isMarketplaceEligiblePatient: boolean,
): string | null {
  if (clinicContext.status === "ok") return null;
  // Self-defending, not just trusting the caller: isMarketplaceEligiblePatient
  // only means anything when status is actually "no-membership" — same
  // discipline decideClinicRedirect itself already has for its own
  // isLinkedPatient parameter, only ever consulted inside that one branch.
  // A caller passing `true` alongside e.g. "unauthenticated" (which should
  // never happen given how route.ts computes this flag, but must never be
  // trusted blindly) still falls through to the correct /login below.
  if (clinicContext.status === "no-membership" && isMarketplaceEligiblePatient) return null;
  // `false` here, not the patient flag: whenever this line runs, this
  // profile is not a Marketplace-eligible patient for a "no-membership"
  // context, and for every other status the flag is irrelevant anyway —
  // per has-patient-link.ts's own reasoning, "no patient link" already
  // implies resolvePatientContext() could never have resolved "ok" either,
  // so decideClinicRedirect's own "no-membership" branch always lands on
  // the correct /registro destination without needing to ask again.
  return decideClinicRedirect(clinicContext, false);
}
