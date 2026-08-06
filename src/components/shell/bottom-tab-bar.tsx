import { MOBILE_TAB_ITEMS } from "./nav-items";

type BottomTabBarProps = {
  // Matched against the same activeNavLabel each page already passes to
  // AppShell, so the active tab tracks the current route exactly like
  // the desktop sidebar does. A future child screen (e.g. a patient
  // detail page) keeps its parent module active by passing that same
  // label, same as it would for the sidebar.
  activeLabel?: string;
};

export function BottomTabBar({ activeLabel }: BottomTabBarProps) {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[var(--mobile-tabbar-h)] items-stretch border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {MOBILE_TAB_ITEMS.map(({ label, icon: Icon, group }) => {
        const active = label === activeLabel;
        const isMarketplace = group === "marketplace";

        return (
          <button
            key={label}
            type="button"
            aria-current={active ? "page" : undefined}
            className="flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px]"
          >
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
            <span className={active ? "font-medium text-primary" : "text-foreground/55"}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
