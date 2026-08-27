"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { signOutSupabase } from "@/features/session/sign-out";

// Real logout for the authenticated app shell (Header/MobileHeader) —
// signs out of Supabase Auth for real, then clears the bridged mock role
// (see src/features/session/role-bridge.ts) through the same RoleProvider
// "logout" every mock screen already expects, then back to /login. Not
// used by PortalShell: the Patient portal has no real Supabase session to
// close yet (see CLAUDE.md task scope).
export function useShellLogout() {
  const router = useRouter();
  const { logout: clearBridgedMockSession } = useRole();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOutSupabase();
    clearBridgedMockSession();
    router.push("/login");
  };

  return { signOut, signingOut };
}
