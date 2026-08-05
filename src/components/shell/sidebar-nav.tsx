import { NAV_ITEMS } from "./nav-items";

type SidebarNavProps = {
  collapsed?: boolean;
  activeLabel?: string;
};

export function SidebarNav({ collapsed = false, activeLabel }: SidebarNavProps) {
  return (
    <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-5">
      {NAV_ITEMS.map(({ label, icon: Icon }) => {
        const active = label === activeLabel;
        return (
          <button
            key={label}
            type="button"
            title={collapsed ? label : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              collapsed ? "justify-center px-2" : ""
            } ${
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-foreground/80 hover:bg-foreground/5"
            }`}
          >
            <Icon className="size-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </button>
        );
      })}
    </nav>
  );
}
