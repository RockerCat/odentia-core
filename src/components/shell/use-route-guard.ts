"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_ROLE, homeRouteForRole, type Role } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import { readSession, subscribeToSession } from "@/features/auth/session";

// No cross-tab/live updates needed within a single tab beyond role/session
// changes, which already go through writeSession/clearSession (see
// subscribeToSession) — a plain snapshot read is enough here.
const noopSubscribe = () => () => {};
const noSessionOnServer = () => false;
const getServerRole = (): Role => DEFAULT_ROLE;
const getClientRole = (): Role => readSession()?.role ?? DEFAULT_ROLE;

// Shared by every shell (AppShell for the clinic dashboard, PortalShell for
// the Patient portal) so the same hydration-safe session/role check isn't
// duplicated per shell. Returns whether the current page may render.
export function useRouteGuard(allowedRoles?: Role[]): boolean {
  const router = useRouter();
  const hasSession = useSyncExternalStore(noopSubscribe, () => readSession() !== null, noSessionOnServer);
  // In production, only a /login demo session unlocks the app. In
  // development, the DEV · CAMBIAR ROL switcher still works without ever
  // logging in — see src/dev/role.ts.
  const sessionOk = process.env.NODE_ENV === "development" || hasSession;

  // Hydration-safe the same way role-context.tsx's own role read is: the
  // server always "sees" DEFAULT_ROLE (no localStorage access), matching
  // the client's first render, so this never causes a mismatch.
  const role = useSyncExternalStore(subscribeToSession, getClientRole, getServerRole);
  // Unlike sessionOk above, this is NOT bypassed in development — the dev
  // role switcher must still kick you out of a role-gated page (e.g. a
  // Patient switched to Odontólogo while on /portal, or vice versa) the
  // moment the role stops being one of allowedRoles.
  const roleOk = !allowedRoles || allowedRoles.includes(role);

  const authorized = sessionOk && roleOk;

  useEffect(() => {
    if (!sessionOk) {
      router.replace("/login");
      return;
    }
    if (!roleOk) router.replace(homeRouteForRole(role));
  }, [sessionOk, roleOk, role, router]);

  return authorized;
}
