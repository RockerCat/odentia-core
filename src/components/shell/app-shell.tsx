"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_ROLE, type Role } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import { RoleProvider } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { readSession, subscribeToSession } from "@/features/auth/session";
import { BottomTabBar } from "./bottom-tab-bar";
import { Header } from "./header";
import { MobileHeader } from "./mobile-header";
import { PageContainer } from "./page-container";
import { Sidebar } from "./sidebar";

type AppShellProps = {
  // Which nav item to highlight — matched by label, on both the desktop
  // sidebar and the mobile bottom tab bar — unrelated to what's actually
  // displayed as the page heading.
  activeNavLabel: string;
  // What renders as the page's <h1>. Kept separate from activeNavLabel
  // so a personalized heading (e.g. a greeting) doesn't break nav
  // highlighting, which still matches against the nav item's own label.
  heading: ReactNode;
  // Route-level role gate (e.g. /admin → "superadmin") — checked on every
  // render, in both dev and production, so switching role via the dev
  // switcher while already on a gated page kicks the user out immediately
  // instead of just hiding its sidebar link. Omit for pages any
  // authenticated role can see.
  requiredRole?: Role;
  children: ReactNode;
};

// No cross-tab/live updates needed within a single tab beyond role/session
// changes, which already go through writeSession/clearSession (see
// subscribeToSession) — a plain snapshot read is enough here.
const noopSubscribe = () => () => {};
const noSessionOnServer = () => false;
const getServerRole = (): Role => DEFAULT_ROLE;
const getClientRole = (): Role => readSession()?.role ?? DEFAULT_ROLE;
const UNAUTHORIZED_ROLE_REDIRECT = "/agenda";

export function AppShell({ activeNavLabel, heading, requiredRole, children }: AppShellProps) {
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
  // role switcher must still kick you out of a role-gated page like
  // /admin the moment you switch away from the required role.
  const roleOk = !requiredRole || role === requiredRole;

  const authorized = sessionOk && roleOk;

  useEffect(() => {
    if (!sessionOk) {
      router.replace("/login");
      return;
    }
    if (!roleOk) router.replace(UNAUTHORIZED_ROLE_REDIRECT);
  }, [sessionOk, roleOk, router]);

  if (!authorized) return null;

  return (
    <RoleProvider>
      <div className="flex h-dvh overflow-hidden bg-surface text-foreground">
        <Sidebar activeLabel={activeNavLabel} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <MobileHeader />

          <main className="flex-1 overflow-y-auto pt-[var(--mobile-header-h)] pb-[var(--mobile-tabbar-h)] md:pt-0 md:pb-0">
            <PageContainer>
              <h1 className="mb-6 text-[19px] font-semibold text-foreground">{heading}</h1>
              {children}
            </PageContainer>
          </main>

          <BottomTabBar activeLabel={activeNavLabel} />
        </div>
      </div>
    </RoleProvider>
  );
}
