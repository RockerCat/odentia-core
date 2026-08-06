import { ROLE_NAV_ITEMS } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { NAV_ITEMS, type NavGroup, type NavItem } from "./nav-items";

type SidebarNavProps = {
  activeLabel?: string;
};

// Only groups with a header get one — "marketplace" is a single
// highlighted item and doesn't need a label of its own.
const GROUP_LABELS: Partial<Record<NavGroup, string>> = {
  work: "Trabajo",
  admin: "Administración",
};

function groupIntoSections(items: readonly NavItem[]) {
  const sections: { group: NavGroup; items: NavItem[] }[] = [];
  for (const item of items) {
    const current = sections[sections.length - 1];
    if (current && current.group === item.group) {
      current.items.push(item);
    } else {
      sections.push({ group: item.group, items: [item] });
    }
  }
  return sections;
}

export function SidebarNav({ activeLabel }: SidebarNavProps) {
  const { role } = useRole();
  // DEV TOOL — revert to plain `NAV_ITEMS` when removing src/dev/.
  const items = process.env.NODE_ENV === "development" ? ROLE_NAV_ITEMS[role] : NAV_ITEMS;
  const sections = groupIntoSections(items);

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-6">
      {sections.map((section, index) => (
        <div
          key={`${section.group}-${index}`}
          className={index > 0 ? "mt-4 border-t border-border pt-4" : undefined}
        >
          {GROUP_LABELS[section.group] && (
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-wide text-label-foreground uppercase">
              {GROUP_LABELS[section.group]}
            </p>
          )}
          <div className="flex flex-col gap-1">
            {section.items.map(({ label, icon: Icon, group }) => {
              const active = label === activeLabel;

              if (group === "marketplace") {
                return (
                  <button
                    key={label}
                    type="button"
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-primary/25 bg-primary/5 text-foreground/90 hover:border-primary/40 hover:bg-primary/10"
                    }`}
                  >
                    <Icon className="size-5 shrink-0 text-primary" />
                    <span className="flex-1 text-left">{label}</span>
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      Promo
                    </span>
                  </button>
                );
              }

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
          </div>
        </div>
      ))}
    </nav>
  );
}
