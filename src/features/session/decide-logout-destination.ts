// Odentia Core's own known production hostnames — the ONLY hosts where
// the federated Core<->Marketplace logout hop (see
// src/components/shell/use-shell-logout.ts and
// src/app/auth/logout/route.ts, the two real callers) is safe to
// perform. Marketplace is a separate, independently-deployed product
// (CLAUDE.md's own Marketplace Independence — it may run on another
// server, another stack, another team entirely) with no localhost/
// preview counterpart to federate with: sending a non-production Core
// (localhost, a preview/staging deploy) through the SAME hardcoded
// production URLs strands the user on the real production site instead
// of wherever they actually started — the exact bug this fixes ("Logout
// desde localhost termina en odentia.co").
//
// Deliberately based on the real hostname the browser/request is
// currently on (window.location.hostname client-side,
// request.nextUrl.hostname server-side) — never NODE_ENV (a preview/
// staging build's NODE_ENV is still "production" in most hosting setups,
// but it isn't THIS real domain) and never anything a query
// param/caller could influence, so this can never become an open
// redirect: it only ever chooses between fixed, hardcoded destinations
// each caller already owns.
const CORE_PRODUCTION_HOSTNAMES = ["odentia.co", "www.odentia.co"];

// Pure — a plain string in, boolean out — so both the client-side
// signOut() and the server-side /auth/logout route can share the
// identical decision without either depending on the other's runtime
// (window vs NextRequest).
export function isCoreProductionHostname(hostname: string): boolean {
  return CORE_PRODUCTION_HOSTNAMES.includes(hostname);
}
