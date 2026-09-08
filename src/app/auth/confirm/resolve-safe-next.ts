// Turns a Confirm Signup / Recovery link's own `next` param into a safe,
// same-origin relative path — used by route.ts before ever redirecting the
// browser. Never follows an attacker- or email-client-supplied URL to a
// different origin; a bare/empty/unrecoverable value always falls back to
// the same default every real caller already expects.
//
// Accepts two shapes, because this app's own emailRedirectTo (see
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
export function resolveSafeNext(rawNext: string | null, origin: string): string {
  const candidate = extractSameOriginPath(rawNext, origin);
  return candidate && candidate !== "/" ? candidate : "/registro";
}

function extractSameOriginPath(rawNext: string | null, origin: string): string | null {
  if (!rawNext) return null;
  if (rawNext.startsWith("/")) return rawNext;
  try {
    const parsed = new URL(rawNext);
    return parsed.origin === origin ? `${parsed.pathname}${parsed.search}` : null;
  } catch {
    return null;
  }
}
