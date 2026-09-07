import { createClient } from "@/lib/supabase/client";

export type SignOutOutcome = { status: "ok" } | { status: "error" };

// Shared real Supabase Auth signOut — used by /registro's "Cerrar sesión"
// (see onboarding/already-onboarded.tsx) and the authenticated app shell's
// "Salir" (see components/shell/use-shell-logout.ts). Never touches the
// mock session in src/features/auth/session.ts — callers clear the bridged
// mock role separately (see role-bridge.ts's clearBridgedMockSession).
//
// scope: "local" — signOut()'s own default is "global", which revokes
// EVERY session for this user across every device/tab, not just this one.
// "Salir" in the app chrome only ever means "log me out of this session",
// same as virtually every SaaS's plain logout button — "global" is a
// distinct, deliberate "sign out everywhere" action this app doesn't even
// offer, so defaulting to it here was accidental over-reach, not a chosen
// behavior. It also explains a real 503 seen from `/auth/v1/logout?scope=
// global` in QA: revoking every session for a user is server-side a
// heavier, broader operation than revoking just the current one, and more
// likely to hit a transient failure. auth-js still clears the LOCAL
// session/cookies before returning even when this request errors (see its
// own _signOut), so callers already degrade safely on failure — never
// blocked, never a stale session left behind.
export async function signOutSupabase(): Promise<SignOutOutcome> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  return error ? { status: "error" } : { status: "ok" };
}
