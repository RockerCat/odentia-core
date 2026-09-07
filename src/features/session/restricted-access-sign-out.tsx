"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearBridgedMockSession } from "./role-bridge";
import { signOutSupabase } from "./sign-out";

// "Cerrar sesión y usar otra cuenta" on /acceso-restringido — same shape as
// onboarding/already-onboarded.tsx's own logout: real Supabase signOut,
// clears the bridged mock role, back to /login.
//
// Always proceeds to local cleanup + navigation regardless of
// signOutSupabase()'s own outcome — same as use-shell-logout.ts's "Salir".
// auth-js's signOut() clears the local session/cookies before returning
// even when the server-side /auth/v1/logout call itself errors (a real,
// observed transient 503 from Supabase — see sign-out.ts's own comment),
// so blocking the user behind a "couldn't sign out" error here would be a
// false failure, not a safety measure: proxy.ts re-validates the real
// session server-side on every request regardless of what this component
// believes client-side, so landing on /login with a session that somehow
// didn't actually clear just bounces the user straight back — never an
// unauthorized view.
export function RestrictedAccessSignOut() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);

    await signOutSupabase();
    clearBridgedMockSession();
    router.push("/login");
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="mt-3 inline-block w-full rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
    >
      {signingOut ? "Cerrando sesión…" : "Cerrar sesión y usar otra cuenta"}
    </button>
  );
}
