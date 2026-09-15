import { NextResponse, type NextRequest } from "next/server";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { resolvePatientContext } from "@/features/session/resolve-patient-context";
import { createClient } from "@/lib/supabase/server";
import { decideClinicRedirect } from "@/lib/supabase/proxy";
import { canonicalCallbackUrl, isCanonicalCallback, isValidState } from "./validate-sso-entry";

// Core's authenticated SSO entry point for Marketplace (SSO E) — the
// destination Marketplace's own GET /auth/sso/start redirects the browser
// to (future ODENTIA_CORE_SSO_URL). Certifies an ALREADY-existing real
// Core session and mints a one-time authorization code via the existing
// issue_marketplace_sso_code() RPC (SSO A, 20260915090000) — never a new
// login/signup, never a new identity, never data from the browser. The
// browser only ever carries an opaque `code` + Marketplace's own `state`
// back to Marketplace's callback; Marketplace redeems the code
// server-to-server via POST /api/sso/exchange (SSO B), already
// implemented and untouched here.
//
// Fail-closed by construction, not by best-effort checking: redirect_uri
// is only ever compared against a canonical URL Core itself builds from
// MARKETPLACE_URL (see validate-sso-entry.ts) — the actual redirect
// target is always that freshly-built canonical URL, never the browser's
// own redirect_uri string, so this can never become an open redirect.

function badRequest() {
  return NextResponse.json({ error: "invalid request" }, { status: 400 });
}

function internalError() {
  return NextResponse.json({ error: "internal error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state");
  const redirectUri = searchParams.get("redirect_uri");

  if (!isValidState(state)) {
    return badRequest();
  }

  // Fail closed if Core isn't configured to know Marketplace's canonical
  // origin at all — never fall back to trusting the caller's own
  // redirect_uri in that case.
  const marketplaceUrl = process.env.MARKETPLACE_URL;
  if (!marketplaceUrl) {
    return internalError();
  }

  let callback: URL;
  try {
    callback = canonicalCallbackUrl(marketplaceUrl);
  } catch {
    return internalError();
  }

  if (!isCanonicalCallback(redirectUri, marketplaceUrl)) {
    return badRequest();
  }

  try {
    const supabase = await createClient();
    const clinicContext = await resolveClinicContext(supabase);

    // Only resolved when it can actually change the outcome — same
    // pattern as src/lib/supabase/proxy.ts's own private-clinic-path
    // gate, reused here via decideClinicRedirect rather than duplicated.
    const isLinkedPatient =
      clinicContext.status === "no-membership" && (await resolvePatientContext(supabase)).status === "ok";

    // Reuses the exact same status → destination decision the real
    // /agenda /pacientes /etc. gate already makes: unauthenticated →
    // /login (the user can sign in, then manually return to Marketplace —
    // see this task's own PENDING/BLOCKERS on why an automatic post-login
    // return isn't wired up here), no-membership → /registro or /portal,
    // and membership-inactive/clinic-suspended/multiple-memberships → the
    // existing /acceso-restringido screen. Every one of these fails
    // closed on code issuance — only "ok" (decideClinicRedirect returning
    // null) proceeds below.
    const blockedRedirect = decideClinicRedirect(clinicContext, isLinkedPatient);
    if (blockedRedirect) {
      return NextResponse.redirect(new URL(blockedRedirect, request.url));
    }

    // clinicContext.status === "ok" here. issue_marketplace_sso_code()
    // resolves profile/membership/clinic itself from auth.uid() — no
    // identity value from clinicContext is passed to it; it is the
    // RPC, not this route, that remains the last authority (see SSO A:
    // 0 or >1 active memberships, or an inactive clinic, fail closed
    // there too, independently of this check).
    const { data, error } = await supabase.rpc("issue_marketplace_sso_code");
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row || typeof row.raw_code !== "string" || !row.raw_code) {
      return internalError();
    }

    // The ONLY identity artifact that ever crosses the browser: an opaque,
    // one-time, 120s-TTL code. Never a user id, clinic id, role, email,
    // Supabase access/refresh token, or the service role key.
    callback.searchParams.set("code", row.raw_code);
    callback.searchParams.set("state", state);

    return NextResponse.redirect(callback);
  } catch {
    // Covers any unexpected Supabase/Postgres error from context
    // resolution or the RPC call — never forwarded to the browser.
    return internalError();
  }
}
