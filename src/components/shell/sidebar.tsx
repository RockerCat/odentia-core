import { ChevronIcon } from "./icons";
import { Logo } from "./logo";
import { SidebarNav } from "./sidebar-nav";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeLabel?: string;
};

export function Sidebar({ collapsed, onToggleCollapse, activeLabel }: SidebarProps) {
  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 ease-in-out md:flex ${
        collapsed ? "md:w-[76px]" : "md:w-64"
      }`}
    >
      <div
        className={`flex h-16 items-center border-b border-border ${
          collapsed ? "justify-center px-2" : "px-5"
        }`}
      >
        <Logo collapsed={collapsed} />
      </div>

      <SidebarNav collapsed={collapsed} activeLabel={activeLabel} />

      <div className={`border-t border-border p-3 ${collapsed ? "flex justify-center" : ""}`}>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-foreground/5"
        >
          <ChevronIcon className={`size-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span>Colapsar</span>}
        </button>
      </div>
    </aside>
  );
}
