import { NextResponse, type NextRequest } from "next/server";
import { isCoreProductionHostname } from "@/features/session/decide-logout-destination";
import { createClient } from "@/lib/supabase/server";

// Exactly two possible PRODUCTION destinations, both fixed literals —
// never a URL accepted or interpolated from the request. `source` is a
// closed discriminator, not a redirect parameter: any value other than
// the exact literal "marketplace" (missing, unknown, or even a URL-shaped
// string like "https://evil.example") resolves to the SAME default below,
// never to itself. This is what makes an open redirect structurally
// impossible here, not just unlikely.
//
// Both are only ever used when this request's own host IS the real
// production Core (isCoreProductionHostname below) — a request landing
// here on any other host (localhost, a preview/staging deploy) gets a
// local relative redirect instead: there is no real Marketplace
// counterpart to federate with off of production (see
// decide-logout-destination.ts's own comment), so hardcoding these two
// absolute URLs unconditionally would strand a non-production visitor on
// the real production site — the same class of bug already fixed in
// use-shell-logout.ts's own signOut().
const CORE_LOGIN_URL = "https://www.odentia.co/login";
const MARKETPLACE_HOME_URL = "https://marketplace.odentia.co/";

// Coordinated logout (Core <-> Marketplace) — landing point for
// Marketplace-initiated logout: Marketplace's own customer-logout-action.ts
// clears odentia_customer_session first, then redirects the browser HERE
// (with `?source=marketplace`) to end Core's own real Supabase session
// too. Never redirects back to Marketplace's own /auth/logout — whichever
// app the user actually clicked "Salir" in is responsible for its OWN
// cleanup before ever navigating to the other app's endpoint, so no
// Core <-> Marketplace <-> Core loop is possible.
//
// A direct/default visit (no `source`, e.g. from Core's own logout flow —
// see use-shell-logout.ts, which does NOT hit this route) or a
// Core-initiated logout both land on Core's own login page, unchanged
// from before this fix.
//
// Deliberately GET, unauthenticated, and idempotent: the only possible
// effect of visiting this URL is ending the CURRENT browser's own Core
// session — never someone else's, never a privilege change, never data
// exposure. Accepted as an intentional "logout CSRF" trade-off, not an
// oversight (see the coordinated-logout audit's own security decisions) —
// a signed one-time token/state would add real complexity to prevent a
// forced logout, which is not worth doing.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  // scope: "local" — same deliberate choice as signOutSupabase() (see
  // src/features/session/sign-out.ts): revoke only this session, never
  // "global" (every device this user is signed in on). auth-js already
  // clears local cookies even when the network call itself errors, so this
  // stays best-effort/idempotent without any extra handling — a browser
  // that already has no session here simply has nothing left to clear, and
  // still lands on the same destination a normal logout would.
  await supabase.auth.signOut({ scope: "local" });

  // Not the real production Core (localhost, a preview/staging deploy) —
  // never redirect to either hardcoded production URL. A relative /login
  // on THIS SAME host/port is the only sane destination here: there is no
  // local Marketplace to redirect to instead (see
  // decide-logout-destination.ts's own comment), and this request could
  // only realistically be a direct/manual visit or a misconfigured
  // non-production Marketplace pointed at this deploy — never a real
  // production Marketplace hop, which always targets the real production
  // hostname.
  if (!isCoreProductionHostname(request.nextUrl.hostname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isMarketplaceInitiated = request.nextUrl.searchParams.get("source") === "marketplace";
  return NextResponse.redirect(isMarketplaceInitiated ? MARKETPLACE_HOME_URL : CORE_LOGIN_URL);
}
