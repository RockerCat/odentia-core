"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearBridgedMockSession } from "./role-bridge";
import { signOutSupabase } from "./sign-out";

// "Cerrar sesión y usar otra cuenta" on /acceso-restringido — same shape as
// onboarding/already-onboarded.tsx's own logout: real Supabase signOut,
// friendly error on failure, clears the bridged mock role, back to /login.
export function RestrictedAccessSignOut() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);

    const outcome = await signOutSupabase();
    if (outcome.status === "error") {
      setSigningOut(false);
      setError("No pudimos cerrar tu sesión. Intenta de nuevo.");
      return;
    }

    clearBridgedMockSession();
    router.push("/login");
  };

  return (
    <>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="mt-3 inline-block w-full rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        {signingOut ? "Cerrando sesión…" : "Cerrar sesión y usar otra cuenta"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </>
  );
}
