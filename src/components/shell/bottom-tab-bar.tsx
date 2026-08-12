import Link from "next/link";
import { ROLE_NAV_ITEMS } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts

type BottomTabBarProps = {
  // Matched against the same activeNavLabel each page already passes to
  // AppShell, so the active tab tracks the current route exactly like
  // the desktop sidebar does. A future child screen (e.g. a patient
  // detail page) keeps its parent module active by passing that same
  // label, same as it would for the sidebar.
  activeLabel?: string;
};

// Only room for ~5 tabs — each role's own ROLE_NAV_ITEMS is already
// ordered by priority (see src/dev/role.ts), so the first 5 double as the
// mobile set without a second curated list to keep in sync.
const MOBILE_TAB_LIMIT = 5;

export function BottomTabBar({ activeLabel }: BottomTabBarProps) {
  const { role } = useRole();
  const items = ROLE_NAV_ITEMS[role].slice(0, MOBILE_TAB_LIMIT);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[var(--mobile-tabbar-h)] items-stretch border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map(({ label, icon: Icon, group, href }) => {
        const active = label === activeLabel;
        const isMarketplace = group === "marketplace";
        const className = "flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px]";
        const children = (
          <>
            {isMarketplace ? (
              <span
                className={`flex size-7 items-center justify-center rounded-full ${
                  active ? "bg-primary/20" : "bg-primary/10"
                }`}
              >
                <Icon className={`size-[18px] ${active ? "text-primary" : "text-primary/80"}`} />
              </span>
            ) : (
              <Icon className={`size-[22px] ${active ? "text-primary" : "text-foreground/55"}`} />
            )}
            <span className={active ? "font-medium text-primary" : "text-foreground/55"}>{label}</span>
          </>
        );

        // Falls back to an inert button for every nav item with no real
        // page behind it yet — see the href comment on NavItem.
        return href ? (
          <Link key={label} href={href} aria-current={active ? "page" : undefined} className={className}>
            {children}
          </Link>
        ) : (
          <button key={label} type="button" aria-current={active ? "page" : undefined} className={className}>
            {children}
          </button>
        );
      })}
    </nav>
  );
}
