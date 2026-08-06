"use client";

import type { ReactNode } from "react";
import { RoleProvider } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
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
  children: ReactNode;
};

export function AppShell({ activeNavLabel, heading, children }: AppShellProps) {
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
