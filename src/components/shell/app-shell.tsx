"use client";

import { useState, type ReactNode } from "react";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { PageContainer } from "./page-container";
import { Sidebar } from "./sidebar";

type AppShellProps = {
  title?: string;
  children: ReactNode;
};

export function AppShell({ title = "Dashboard", children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        activeLabel={title}
      />

      <MobileNav
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        activeLabel={title}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </div>
  );
}
