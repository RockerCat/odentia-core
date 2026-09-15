// Pure, testable validation for GET /marketplace/entrar (the Marketplace
// SSO entry point — see route.ts). Two independent guards on the two
// inputs Marketplace's own /auth/sso/start sends: the opaque `state` Core
// never interprets, only forwards unchanged, and the `redirect_uri` Core
// must NEVER follow blindly — that's exactly the shape of an open
// redirect. route.ts uses redirect_uri only as proof the caller already
// agrees with Core's own canonical callback, then reconstructs the actual
// redirect target from MARKETPLACE_URL itself.

const MAX_STATE_LENGTH = 512;
const MAX_REDIRECT_URI_LENGTH = 2048;

// Reasonable shape/length guard only — Core never interprets state's
// content or persists it, so this is defense against absurd/malformed
// input, not a format Core owns or validates semantically.
export function isValidState(state: string | null): state is string {
  if (!state || state.length > MAX_STATE_LENGTH) return false;
  // Reject control/newline characters. route.ts later embeds this
  // verbatim into a redirect URL's query string via URLSearchParams,
  // which percent-encodes safely regardless — this is just a sign such
  // input was never a legitimate opaque token from Marketplace's own
  // generator to begin with.
  return !/[\x00-\x1f\x7f]/.test(state);
}

// The ONLY callback Core will ever redirect to: MARKETPLACE_URL's own
// origin plus the fixed, canonical /auth/sso/callback path — never
// anything read off the browser's own redirect_uri. Throws if
// marketplaceUrl itself isn't a valid absolute URL; callers decide how to
// fail closed on that (a config problem, distinct from a bad
// redirect_uri).
export function canonicalCallbackUrl(marketplaceUrl: string): URL {
  return new URL("/auth/sso/callback", marketplaceUrl);
}

// Exact match required: same origin (protocol + host + port), same
// pathname, no query string, no fragment. A different host, a
// subdomain, a different path, a protocol-relative or javascript:/data:
// URL, or extra query/fragment all fail closed. `new URL(...)` throwing
// on a non-absolute or malformed string (bare path, "//evil.com/...",
// etc.) is itself part of the rejection, not a bug to work around — for
// a non-special scheme like "javascript:", `.origin` reads as the string
// "null", which can never equal a real https/http origin either way.
export function isCanonicalCallback(redirectUri: string | null, marketplaceUrl: string): boolean {
  if (!redirectUri || redirectUri.length > MAX_REDIRECT_URI_LENGTH) return false;

  let parsed: URL;
  let canonical: URL;
  try {
    parsed = new URL(redirectUri);
    canonical = canonicalCallbackUrl(marketplaceUrl);
  } catch {
    return false;
  }

  return parsed.origin === canonical.origin && parsed.pathname === canonical.pathname && parsed.search === "" && parsed.hash === "";
}
