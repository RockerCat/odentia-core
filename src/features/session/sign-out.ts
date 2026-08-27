import { createClient } from "@/lib/supabase/client";

export type SignOutOutcome = { status: "ok" } | { status: "error" };

// Shared real Supabase Auth signOut — used by /registro's "Cerrar sesión"
// (see onboarding/already-onboarded.tsx) and the authenticated app shell's
// "Salir" (see components/shell/use-shell-logout.ts). Never touches the
// mock session in src/features/auth/session.ts — callers clear the bridged
// mock role separately (see role-bridge.ts's clearBridgedMockSession).
export async function signOutSupabase(): Promise<SignOutOutcome> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  return error ? { status: "error" } : { status: "ok" };
}
