"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDownIcon, LogOutIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { signOutSupabase } from "@/features/session/sign-out";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

// Real Superadmin identity in the Platform header — name/email come from
// resolveSuperadminContext() (see /platform/layout.tsx, the only caller),
// never a mock name. Deliberately a smaller, purpose-built component, not
// a reuse of src/components/shell/authenticated-user-menu.tsx: that one
// also renders a Marketplace cart icon and a notifications bell, both
// clinic-facing concerns that don't apply to a platform administrator —
// pulling it in wholesale would show a shopping cart on a Superadmin's
// own admin console. UserAvatar itself IS reused directly (already the
// canonical avatar for every user in the system, Superadmin included).
export function PlatformHeader({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = name.trim() || email;

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    // Plain same-app sign-out (see RestrictedAccessSignOut, the same
    // convention already used elsewhere for a Platform-adjacent screen) —
    // never the clinic shell's coordinated Marketplace-logout hop
    // (use-shell-logout.ts): a Superadmin session has nothing to do with
    // Marketplace's own customer identity, so there is nothing to
    // coordinate here.
    await signOutSupabase();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-10 hidden h-20 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6 md:flex">
      <div className="relative ml-auto">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-foreground/5"
        >
          <UserAvatar name={displayName} initials={initialsFor(displayName)} />
          <span className="hidden text-left sm:block">
            <span className="block text-sm leading-tight font-medium">{displayName}</span>
            <span className="block text-xs leading-tight text-muted-foreground">Superadmin</span>
          </span>
          <ChevronDownIcon className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
        </button>

        {menuOpen && (
          <>
            <div aria-hidden="true" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40" />
            <div
              role="menu"
              className="absolute top-full right-0 z-50 mt-2 w-52 rounded-xl border border-border bg-background p-1.5 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-danger/5 disabled:opacity-60"
              >
                <LogOutIcon className="size-4 shrink-0" />
                {signingOut ? "Cerrando sesión…" : "Salir"}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
