// Turns a Confirm Signup / Recovery link's own `next` param into a safe
// redirect destination — used by route.ts before ever redirecting the
// browser. Never follows an attacker- or email-client-supplied URL to an
// arbitrary different origin; a bare/empty/unrecoverable value always
// falls back to the same default every real caller already expects.
//
// Return shape (IMPORTANT — this changed under PROMPT NINJA "signup
// iniciado en localhost confirma email en producción", see below): a bare
// relative path ("/registro") when the destination is the SAME origin as
// this confirm request itself — route.ts prepends its own `origin` to
// that, exactly as before. But for the one deliberate exception (a
// loopback destination, below), this returns a FULL absolute URL
// instead, precisely so route.ts does NOT re-prepend its own (production)
// origin on top of it — doing that would silently send the browser right
// back to production, defeating the entire point of the exception.
// route.ts's own redirect construction handles both shapes.
//
// Accepts three shapes, because this app's own emailRedirectTo (see
// signUpAccount()/requestPasswordReset()) now sends the real destination
// itself, not a query string this app built:
//   - already relative ("/registro", "/invitacion/abc123") — what
//     requestPasswordReset() still sends today (`?next=%2Freset-password`),
//     and what any direct visit to this route with a hand-built `next`
//     would look like.
//   - a same-origin absolute URL ("https://odentia.co/invitacion/abc123")
//     — what Supabase's own `.RedirectTo` template variable resolves to
//     once the Confirm Signup template embeds it as `next={{ .RedirectTo }}`
//     (see signUpAccount()'s own comment for the exact template string).
//     `.RedirectTo` is GoTrue's own echo of emailRedirectTo when it passed
//     the Redirect URLs allow-list, or a bare `{{ .SiteURL }}` (no path at
//     all) when it didn't — the second case collapses to "/" below and is
//     treated exactly like "no next at all", never a broken/invalid
//     redirect.
//   - a loopback absolute URL ("http://localhost:3000/registro",
//     "http://127.0.0.1:3000/registro") — see isLoopbackOrigin's own
//     comment for why this, and only this, different-origin destination
//     is trusted.
//
// `fallback` (default "/registro", signup's own destination) — found
// running a real password-reset E2E pass against production: a real
// Recovery email's `.RedirectTo` collapsed to bare `{{ .SiteURL }}` the
// exact same way Confirm Signup's does (same Redirect URLs allow-list
// issue), and landing on the hardcoded "/registro" default put an
// already-onboarded admin on "Tu clínica ya está configurada" instead of
// the password form — a real dead end, not just a wrong destination.
// route.ts now passes "/reset-password" here for `type === "recovery"`.
export function resolveSafeNext(rawNext: string | null, origin: string, fallback: string = "/registro"): string {
  const candidate = extractSafeDestination(rawNext, origin);
  return candidate && candidate !== "/" ? candidate : fallback;
}

// PROMPT NINJA "signup iniciado en localhost confirma email en
// producción": when a single Supabase project is shared between local dev
// and production, its Site URL can only ever be ONE value — and Supabase
// always links Confirm Signup emails to `{{ .SiteURL }}/auth/confirm`, so
// the token exchange (and the session cookie it sets) always happens on
// whichever host Site URL points to, regardless of what emailRedirectTo
// said or where the user actually started signing up (see
// signUpAccount()'s own comment). If Site URL is production, a signup
// started on localhost still gets its email confirmed by a REQUEST TO
// PRODUCTION — this file's `origin` parameter, downstream, is production's
// own request origin, never localhost's.
//
// Bouncing the browser BACK to the developer's own loopback address from
// there is not the open-redirect this same-origin check exists to
// prevent: unlike an arbitrary remote host, http://localhost /
// http://127.0.0.1 only ever resolves to whatever's running on the
// VISITING browser's own machine — never a real exfiltration target (the
// same allowance RFC 8252 makes for native-app OAuth loopback redirects).
// http only, exact hostname match (never a substring like
// "localhost.evil.com"), any port.
//
// This on its own does NOT restore the confirmed session on localhost —
// cookies set for production's domain never travel to a different origin.
// It only gets the user's BROWSER back to the right environment; from
// there, a normal password login (already fully real — see
// decideAuthenticatedRedirect) re-establishes a real local session and
// resumes onboarding via the existing reentry check. Getting the SESSION
// itself to also transfer would need a genuinely different mechanism —
// out of scope for this fix (see this task's own final report).
function isLoopbackOrigin(url: URL): boolean {
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

function extractSafeDestination(rawNext: string | null, origin: string): string | null {
  if (!rawNext) return null;
  if (rawNext.startsWith("/")) return rawNext;
  try {
    const parsed = new URL(rawNext);
    if (parsed.origin === origin) return `${parsed.pathname}${parsed.search}`;
    // Full absolute URL on purpose — see this file's own header comment on
    // why route.ts must NOT re-prepend its own origin for this case.
    if (isLoopbackOrigin(parsed)) return `${parsed.origin}${parsed.pathname}${parsed.search}`;
    return null;
  } catch {
    return null;
  }
}
