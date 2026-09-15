"use client";

import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { BellIcon, ChevronDownIcon, LogOutIcon, ShoppingCartIcon, UserIcon } from "./icons";
import { MARKETPLACE_URL } from "./nav-items";
import { useMarketplaceCartCount } from "./use-marketplace-cart-count";

type AuthenticatedUserMenuIdentity = {
  name: string;
  initials: string;
  avatar_url?: string;
  secondaryLabel: string;
};

type AuthenticatedUserMenuProps = {
  identity: AuthenticatedUserMenuIdentity;
  // null hides the "Perfil" menu item entirely — a caller only passes a
  // handler when a real profile destination actually exists (see
  // header.tsx and landing-header.tsx for their own, different rules on
  // when that's true).
  onProfileClick: (() => void) | null;
  onSignOut: () => void;
  signingOut: boolean;
};

// Shared avatar/name/clinic + user dropdown (Perfil/Salir), plus the
// notifications bell and the Marketplace access — extracted from the app
// shell's desktop Header so the public landing's authenticated header block
// (landing-header.tsx) reuses the exact same menu instead of a second,
// visually-duplicated one. The bell has no real notifications wired up
// anywhere yet (see CLAUDE.md task scope) — same static badge everywhere
// this renders.
//
// The Marketplace icon is a plain external link to the same MARKETPLACE_URL
// (Marketplace's own SSO start) as nav-items.ts's sidebar/tab-bar entry and
// marketplace-card.tsx — see PROJECT_STATUS.md's "SSO Core → Marketplace"
// checkpoint for the full flow — styled identically to the bell so it reads
// as the same group of header actions.
//
// Shared Cart Checkpoint A: the badge is the REAL Marketplace cart count
// (see use-marketplace-cart-count.ts), not a static/fake number — Core
// only ever reads Marketplace's own odentia_cart cookie server-side; it
// never writes it, never calls Marketplace, and this link's destination
// (still Marketplace's SSO start, unchanged) is a separate concern from
// Checkpoint B.
export function AuthenticatedUserMenu({ identity, onProfileClick, onSignOut, signingOut }: AuthenticatedUserMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cartCount = useMarketplaceCartCount();

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <a
        href={MARKETPLACE_URL}
        aria-label={cartCount > 0 ? `Ir al Marketplace, ${cartCount} producto${cartCount === 1 ? "" : "s"} en el carrito` : "Ir al Marketplace"}
        className="relative flex size-9 items-center justify-center rounded-lg text-foreground/80 hover:bg-foreground/5"
      >
        <ShoppingCartIcon className="size-5" />
        {cartCount > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-warning text-[10px] font-medium text-primary-foreground">
            {cartCount}
          </span>
        )}
      </a>

      <button
        type="button"
        aria-label="Notificaciones"
        className="relative flex size-9 items-center justify-center rounded-lg text-foreground/80 hover:bg-foreground/5"
      >
        <BellIcon className="size-5" />
        <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-warning text-[10px] font-medium text-primary-foreground">
          2
        </span>
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-foreground/5"
        >
          <UserAvatar name={identity.name} initials={identity.initials} avatar_url={identity.avatar_url} />
          <span className="hidden text-left sm:block">
            <span className="block text-sm leading-tight font-medium">{identity.name}</span>
            <span className="block text-xs leading-tight text-muted-foreground">{identity.secondaryLabel}</span>
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
              {onProfileClick && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onProfileClick();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground/80 hover:bg-foreground/5"
                  >
                    <UserIcon className="size-4 shrink-0" />
                    Perfil
                  </button>
                  <div className="my-1 border-t border-border" />
                </>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={signingOut}
                // Deliberately does NOT setMenuOpen(false) here — see
                // header.tsx's own comment on why this stays open through
                // signOut() (lets "Cerrando sesión…" actually be seen).
                onClick={onSignOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-danger/5 disabled:opacity-60"
              >
                <LogOutIcon className="size-4 shrink-0" />
                {signingOut ? "Cerrando sesión…" : "Salir"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
