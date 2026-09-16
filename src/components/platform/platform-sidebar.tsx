"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BuildingIcon, CreditCardIcon, DashboardIcon, SlidersIcon, StoreIcon, UsersIcon } from "@/components/shell/icons";
import { Logo } from "@/components/shell/logo";

type PlatformNavItem = {
  label: string;
  icon: typeof DashboardIcon;
  // Omitted = no real screen yet — renders as an inert, disabled item,
  // same "no href = not built" convention src/components/shell/
  // sidebar-nav.tsx already uses for the clinic-facing shell.
  href?: string;
};

type PlatformNavGroup = {
  label: string;
  items: PlatformNavItem[];
};

// Real, standalone Platform sidebar — visually aligned with the approved
// Superadmin structure already designed for this project (same three
// sections/order/icons as src/dev/role.ts's own superadmin nav config,
// which mirrors the approved Demo /admin shell), but built for real
// routing/auth. Deliberately NOT src/components/shell/sidebar-nav.tsx:
// that component reads the MOCK role (useRole()/ROLE_NAV_ITEMS) — exactly
// the client-side/mock authorization this checkpoint's whole initiative
// must never depend on. Only Inicio/Clínicas have a real screen behind
// them yet (this checkpoint); Usuarios/Suscripciones/Marketplace/
// Configuración are real, planned sections with no functionality built
// yet — never fake screens, just clearly inert until their own
// checkpoint.
const NAV_GROUPS: PlatformNavGroup[] = [
  {
    label: "Plataforma",
    items: [
      { label: "Inicio", icon: DashboardIcon, href: "/platform" },
      { label: "Clínicas", icon: BuildingIcon, href: "/platform/clinicas" },
      { label: "Usuarios", icon: UsersIcon },
    ],
  },
  {
    label: "Negocio",
    items: [
      { label: "Suscripciones", icon: CreditCardIcon },
      { label: "Marketplace", icon: StoreIcon },
    ],
  },
  {
    label: "Administración",
    items: [{ label: "Configuración", icon: SlidersIcon }],
  },
];

function isActiveHref(pathname: string, href: string): boolean {
  return href === "/platform" ? pathname === "/platform" : pathname === href || pathname.startsWith(`${href}/`);
}

export function PlatformSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-background md:flex">
      <div className="flex items-center justify-center border-b border-border px-4 py-8">
        <Logo />
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-6">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label} className={index > 0 ? "mt-4 border-t border-border pt-4" : undefined}>
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-wide text-label-foreground uppercase">{group.label}</p>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active = item.href ? isActiveHref(pathname, item.href) : false;
                const baseClassName = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors";
                const Icon = item.icon;

                if (!item.href) {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      disabled
                      aria-disabled="true"
                      title="Próximamente"
                      className={`${baseClassName} cursor-not-allowed text-foreground/40 opacity-60`}
                    >
                      <Icon className="size-5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`${baseClassName} ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-foreground/5"}`}
                  >
                    <Icon className="size-5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
