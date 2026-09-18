"use client";

import { useState } from "react";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { isCoreProductionHostname } from "@/features/session/decide-logout-destination";
import { signOutSupabase } from "@/features/session/sign-out";

// Coordinated logout (Core <-> Marketplace, see src/app/auth/logout/
// route.ts's own comment for the full picture): on the REAL production
// Core, the ONLY destination this flow ever navigates to — a fixed
// literal, never derived from any caller input. Marketplace's own
// /auth/logout clears odentia_customer_session there and redirects back
// to Core's login page; it never redirects back to this endpoint, so no
// Core <-> Marketplace <-> Core loop is possible.
const MARKETPLACE_LOGOUT_URL = "https://marketplace.odentia.co/auth/logout";
// On any OTHER host (localhost, a preview/staging deploy) there is no
// real Marketplace counterpart to federate with — see
// decide-logout-destination.ts's own comment. A plain, same-origin,
// relative destination: never hardcodes a port, works whatever
// host/port this actually is.
const LOCAL_LOGIN_PATH = "/login";

// Real logout for the authenticated app shell (Header/MobileHeader) and
// the Patient Portal (PortalShell) — signs out of Supabase Auth for real,
// then clears the bridged mock role (see src/features/session/role-
// bridge.ts) through the same RoleProvider "logout" every mock screen
// still expects.
//
// Coordinated logout: the final navigation is now always a full-page,
// cross-origin visit to Marketplace's own cleanup endpoint rather than a
// same-app router.push() — every real "Salir" click ends at the exact
// same place (Core's own login page, reached via Marketplace's hop)
// regardless of the current browser's Marketplace customer-session state;
// a browser with none simply hits a harmless no-op cleanup on the way
// through. This is why the previous `redirectTo` parameter was removed
// rather than kept as now-dead configuration — there is no other
// meaningful destination left to parameterize (see landing-header.tsx,
// whose own call site no longer passes one).
export function useShellLogout() {
  const { logout: clearBridgedMockSession } = useRole();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOutSupabase();
    clearBridgedMockSession();
    // window.location.assign, not router.push: the production destination
    // is a different origin entirely, which next/navigation's router has
    // no way to navigate to (the local destination is same-origin, but
    // this still uses a full navigation either way, keeping the two
    // branches symmetric and guaranteeing a hard reload clears any
    // remaining client-side state regardless of which one runs).
    window.location.assign(isCoreProductionHostname(window.location.hostname) ? MARKETPLACE_LOGOUT_URL : LOCAL_LOGIN_PATH);
  };

  return { signOut, signingOut };
}
