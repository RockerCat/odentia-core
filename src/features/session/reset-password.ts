import { createClient } from "@/lib/supabase/client";

export type RequestPasswordResetOutcome = { status: "ok" } | { status: "error"; message: string };
export type UpdatePasswordOutcome = { status: "ok" } | { status: "error"; message: string };

// Real Supabase Auth password recovery — official resetPasswordForEmail()/
// updateUser() flow, no invented token of our own. redirectTo reuses the
// SAME server route signUpAccount() already points at
// (src/app/auth/confirm/route.ts) rather than a second redirect URL:
// GoTrue's own recovery link — like its signup-confirmation link — lands
// there as either token_hash+type or a PKCE code (this browser client
// always uses PKCE, see src/lib/supabase/client.ts), and that route
// already handles both shapes generically via a `next` param, establishing
// the real SSR session via cookies before handing off. Only the app's own
// ORIGIN needs to be Supabase Auth's Redirect URL allow-list — already
// true today since /auth/confirm is already relied on by signup and the
// Clínica → Equipo invitation flow — no new allow-list entry needed for
// this feature.
//
// resetPasswordForEmail() itself never reveals whether the email exists
// (Supabase's own anti-enumeration design) — this wrapper preserves that:
// ANY successful call (regardless of whether an account exists) reaches
// the same neutral copy on /forgot-password; only a genuine send failure
// (network/rate-limit) surfaces as a recoverable error, never a friendlier
// "no account found" message that would leak existence.
export async function requestPasswordReset(email: string): Promise<RequestPasswordResetOutcome> {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
  });
  if (error) return { status: "error", message: "No pudimos procesar tu solicitud. Intenta de nuevo en unos minutos." };
  return { status: "ok" };
}

// Only ever called from /reset-password, after confirming a real session
// exists (the recovery link's own session, established by /auth/confirm
// before this page even renders — see that page's own comment). Updates
// the CALLER's own password — Supabase Auth itself is what enforces that
// scope, never a client-supplied user id.
export async function updatePassword(password: string): Promise<UpdatePasswordOutcome> {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.message.toLowerCase().includes("password")) {
      return { status: "error", message: "La contraseña no cumple los requisitos de seguridad. Intenta con otra." };
    }
    return { status: "error", message: "No pudimos actualizar tu contraseña. Intenta de nuevo." };
  }
  return { status: "ok" };
}
