import { ROLE_NAV_ITEMS } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { NAV_ITEMS } from "./nav-items";

type SidebarNavProps = {
  activeLabel?: string;
};

export function SidebarNav({ activeLabel }: SidebarNavProps) {
  const { role } = useRole();
  // DEV TOOL — revert to plain `NAV_ITEMS` when removing src/dev/.
  const items = process.env.NODE_ENV === "development" ? ROLE_NAV_ITEMS[role] : NAV_ITEMS;

  return (
    <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-6">
      {items.map(({ label, icon: Icon }) => {
        const active = label === activeLabel;
        return (
          <button
            key={label}
            type="button"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-foreground/80 hover:bg-foreground/5"
            }`}
          >
            <Icon className="size-5 shrink-0" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
