import { createClient } from "@/lib/supabase/client";

export type SignInOutcome = { status: "ok" } | { status: "error"; message: string };

// Real Supabase Auth login for /login — see login/page.tsx. Only ever
// friendly copy reaches the UI, never Supabase's raw error message.
export async function signInWithPassword(email: string, password: string): Promise<SignInOutcome> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { status: "error", message: friendlySignInError(error.message) };
  return { status: "ok" };
}

function friendlySignInError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed")) {
    return "Confirma tu correo antes de iniciar sesión.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  return "No pudimos iniciar sesión. Intenta de nuevo en unos minutos.";
}
