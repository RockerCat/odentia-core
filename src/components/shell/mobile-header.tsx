import { useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { CURRENT_USER } from "@/lib/current-user";
import { firstName } from "@/lib/format";
import { CreditCardIcon, LogOutIcon, SlidersIcon, UserIcon } from "./icons";
import { Logo } from "./logo";

const USER_MENU_ITEMS = [
  { label: "Perfil", icon: UserIcon },
  { label: "Mi Suscripción", icon: CreditCardIcon },
  { label: "Configuración", icon: SlidersIcon },
];

export function MobileHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-[var(--mobile-header-h)] border-b border-border bg-surface pt-[env(safe-area-inset-top)] md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Logo className="h-7 w-auto" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Menú de usuario"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-full py-1 pr-1 pl-2 hover:bg-foreground/5"
          >
            <span className="hidden max-w-24 truncate text-sm font-medium min-[380px]:block">
              {firstName(CURRENT_USER.name)}
            </span>
            <UserAvatar
              name={CURRENT_USER.name}
              initials={CURRENT_USER.initials}
              avatar_url={CURRENT_USER.avatar_url}
              sizeClassName="size-8"
            />
          </button>

          {menuOpen && (
            <>
              <div
                aria-hidden="true"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40"
              />
              <div
                role="menu"
                className="absolute top-full right-0 z-50 mt-2 w-52 rounded-xl border border-border bg-background p-1.5 shadow-lg"
              >
                {USER_MENU_ITEMS.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground/80 hover:bg-foreground/5"
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
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
