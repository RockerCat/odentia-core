"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { signOutSupabase } from "@/features/session/sign-out";

// Real logout for the authenticated app shell (Header/MobileHeader) —
// signs out of Supabase Auth for real, then clears the bridged mock role
// (see src/features/session/role-bridge.ts) through the same RoleProvider
// "logout" every mock screen already expects, then back to /login by
// default. Not used by PortalShell: the Patient portal has no real
// Supabase session to close yet (see CLAUDE.md task scope).
//
// `redirectTo` lets a caller outside the app shell (the public landing's
// authenticated header block, see landing-header.tsx) land back on "/"
// instead — useRole()'s default context value (no RoleProvider ancestor
// required) makes clearBridgedMockSession a harmless no-op there, since
// there is no mock session to clear on a public page.
export function useShellLogout(redirectTo = "/login") {
  const router = useRouter();
  const { logout: clearBridgedMockSession } = useRole();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOutSupabase();
    clearBridgedMockSession();
    router.push(redirectTo);
  };

  return { signOut, signingOut };
}
