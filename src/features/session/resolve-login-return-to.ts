// Turns /login's own `?next=` query param into a safe, internal redirect
// destination — used only by login/page.tsx's post-sign-in handler.
//
// Deliberately its own small function rather than a reuse of
// src/app/auth/confirm/resolve-safe-next.ts: that one is built around a
// specific problem (a Confirm Signup/Recovery link's `.RedirectTo`, which
// can legitimately be a same-origin ABSOLUTE URL, plus one deliberate
// cross-origin loopback exception for local dev against a shared prod
// Supabase project — see that file's own header comment). None of that
// applies here: `next` on /login is always something OUR OWN code
// constructed as a plain relative path (e.g. `/invitacion/<token>`,
// appended when linking here from an invitation) — there is never a
// legitimate reason for it to be an absolute URL, same-origin or not.
// Same underlying policy as resolveSafeNext's own primary case
// (`rawNext.startsWith("/")`), just without the absolute-URL/loopback
// branches this simpler case doesn't need.
//
// Rejects anything that isn't unambiguously an internal path:
//   - null/empty → no redirect override.
//   - doesn't start with "/" → rejected (rules out "https://evil...",
//     "evil.com", bare schemes, etc. outright).
//   - starts with "//" → rejected (a protocol-relative URL — the browser
//     treats "//evil.example" as "https://evil.example", not a path).
//   - starts with "/\" → rejected (some browsers normalize a leading
//     backslash to a second slash, the same protocol-relative trick
//     spelled differently).
export function resolveLoginReturnTo(rawNext: string | null): string | null {
  if (!rawNext) return null;
  if (!rawNext.startsWith("/")) return null;
  if (rawNext.startsWith("//") || rawNext.startsWith("/\\")) return null;
  return rawNext;
}
