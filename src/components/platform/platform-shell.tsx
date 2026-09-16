import type { ReactNode } from "react";
import { PageContainer } from "@/components/shell/page-container";
import { ShellContentErrorBoundary } from "@/components/shell/shell-content-error-boundary";
import { PlatformHeader } from "./platform-header";
import { PlatformSidebar } from "./platform-sidebar";

// Real Platform shell — the authorization itself already happened in
// /platform/layout.tsx (the only caller) before this ever renders; this
// component is purely presentational. Mirrors AppShell's own container
// structure (sidebar | header+content, PageContainer, error boundary) for
// visual consistency, but with no mock role/RoleProvider, no
// useRouteGuard, no BottomTabBar/MobileHeader — Platform's own two real
// screens so far (Inicio, Clínicas) are desktop-first by design; a
// mobile nav is a real gap to revisit once Platform has enough surface
// to justify one, not something to fake here.
export function PlatformShell({ name, email, children }: { name: string; email: string; children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-surface text-foreground">
      <PlatformSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <PlatformHeader name={name} email={email} />

        <main className="flex-1 overflow-y-auto">
          <PageContainer>
            <ShellContentErrorBoundary>{children}</ShellContentErrorBoundary>
          </PageContainer>
        </main>
      </div>
    </div>
  );
}
