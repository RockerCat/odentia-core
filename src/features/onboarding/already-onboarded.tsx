"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/shell/logo";
import { CheckCircleIcon } from "@/components/shell/icons";
import { signOutSupabase } from "@/features/session/sign-out";

// Shown when an authenticated user with an active clinic_memberships row
// lands on /registro — /registro must never let them accidentally create a
// second clinic (see task scope, section 7; multi-clínica stays a future
// explicit feature). The app shells still gate on the mock session (see
// CLAUDE.md, section 23), so this deliberately does not try to route them
// into /agenda with their real Supabase identity.
//
// "Cerrar sesión" exists purely so /registro can be re-tested end to end
// with another account — until the global Login is wired to real Supabase
// Auth, there is nowhere else in the app to close this real session (see
// task scope). `onSignedOut` reuses the wizard's own reentry check (see
// onboarding-wizard.tsx's handleRetryInitialCheck) rather than a hard
// navigation, so the now-sessionless check naturally lands on Paso 1.
export function AlreadyOnboarded({ onSignedOut }: { onSignedOut: () => void }) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);

    const outcome = await signOutSupabase();
    if (outcome.status === "error") {
      setSigningOut(false);
      setSignOutError("No pudimos cerrar tu sesión. Intenta de nuevo.");
      return;
    }

    onSignedOut();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-12 w-auto" />

        <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircleIcon className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-foreground">Tu clínica ya está configurada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu cuenta ya tiene una clínica activa en Odentia. Muy pronto podrás iniciar sesión con ella; mientras
            tanto, explora Odentia con nuestro acceso de demostración.
          </p>

          <Link
            href="/"
            className="mt-6 inline-block w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Volver al inicio
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-3 inline-block w-full rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
          {signOutError && <p className="mt-1 text-xs text-danger">{signOutError}</p>}
        </div>
      </div>
    </div>
  );
}
