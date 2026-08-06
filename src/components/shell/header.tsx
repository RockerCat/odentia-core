"use client"; // needed for the user menu's open/close state below.

import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { CURRENT_USER } from "@/lib/current-user";
import { BellIcon, ChevronDownIcon, LogOutIcon, SearchIcon, UserIcon } from "./icons";

// Desktop only — mobile uses MobileHeader + BottomTabBar instead.
export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-10 hidden h-20 shrink-0 items-center gap-4 border-b border-border bg-surface px-4 sm:px-6 md:flex">
      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <div className="hidden items-center gap-2 rounded-full bg-background px-4 py-2.5 text-sm text-muted-foreground md:flex md:w-64 lg:w-96">
          <SearchIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate">Buscar pacientes, citas, tratamientos...</span>
          <SearchIcon className="size-4 shrink-0" />
        </div>

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
            <UserAvatar
              name={CURRENT_USER.name}
              initials={CURRENT_USER.initials}
              avatar_url={CURRENT_USER.avatar_url}
            />
            <span className="hidden text-left sm:block">
              <span className="block text-sm leading-tight font-medium">{CURRENT_USER.name}</span>
              <span className="block text-xs leading-tight text-muted-foreground">
                {CURRENT_USER.clinicName}
              </span>
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
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground/80 hover:bg-foreground/5"
                >
                  <UserIcon className="size-4 shrink-0" />
                  Perfil
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-danger/5"
                >
                  <LogOutIcon className="size-4 shrink-0" />
                  Salir
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
