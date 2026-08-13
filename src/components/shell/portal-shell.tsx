"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { RoleProvider, useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { RoleSwitcher } from "@/dev/role-switcher"; // DEV TOOL — see src/dev/role.ts
import { useAuthenticatedIdentity } from "@/features/dashboard/use-authenticated-identity";
import { CURRENT_PATIENT } from "@/lib/current-user";
import { BuildingIcon, CalendarIcon, ChevronDownIcon, LogOutIcon, NoteIcon, ToothIcon, UserIcon } from "./icons";
import { Logo } from "./logo";
import { PageContainer } from "./page-container";
import { useRouteGuard } from "./use-route-guard";

// The Patient's own portal shell — deliberately NOT AppShell. A Patient
// never sees the clinic dashboard's nav (Marketplace, Reportes, Clínica,
// professionals, clinic settings) or /admin, so this is a separate, much
// simpler shell: 4 fixed sections, no search/notifications/role-scoped
// groups. Its header (avatar/name/secondary label, click → Mi perfil/Salir)
// deliberately mirrors shell/header.tsx and mobile-header.tsx so the
// account menu feels the same across Odentia, just with a shorter,
// Patient-appropriate action set. No "Inicio" (Mis citas is the entry
// point) and no "Mi perfil" here — that stays exclusively in the avatar
// menu above, same as Salir.
//
// The clinic item's label is the clinic's actual name on purpose — this
// mock Patient belongs to exactly one clinic. If/when a Patient can belong
// to several, this becomes "Mi clínica" with a picker instead — not built
// yet, see my-clinic-screen.tsx.
// Mobile-only header branding: for the Patient, Odentia is the platform
// behind the scenes, not the brand they're interacting with — that's their
// clinic (see task scope: this replaces Odentia's own logo in the Patient's
// mobile header only, never the desktop sidebar, and never for any other
// role). Same mock asset as the Clinic Admin's own Clínica page/Agenda
// identity card; hardcoded per this iteration's scope — no dynamic
// per-clinic branding/slug resolution yet.
const CLINIC_LOGO_URL = "/branding/sonrisa_perfecta.png";

const PORTAL_NAV_ITEMS = [
  { label: "Mis citas", icon: CalendarIcon, href: "/portal/citas" },
  { label: "Mi salud dental", icon: ToothIcon, href: "/portal/salud" },
  { label: "Mi Historia Clínica", icon: NoteIcon, href: "/portal/historia" },
  { label: CURRENT_PATIENT.clinicName, icon: BuildingIcon, href: "/portal/clinica" },
];

type PortalShellProps = {
  activeNavLabel: string;
  // Optional so a screen can start directly with its own content (e.g.
  // Mis citas leading with "Próxima cita") instead of a redundant page
  // title — activeNavLabel still drives nav highlighting either way.
  heading?: ReactNode;
  children: ReactNode;
};

export function PortalShell({ activeNavLabel, heading, children }: PortalShellProps) {
  const authorized = useRouteGuard(["patient"]);

  if (!authorized) return null;

  return (
    <RoleProvider>
      <PortalChrome activeNavLabel={activeNavLabel} heading={heading}>
        {children}
      </PortalChrome>
    </RoleProvider>
  );
}

function PortalChrome({ activeNavLabel, heading, children }: PortalShellProps) {
  const router = useRouter();
  const { logout } = useRole();
  const identity = useAuthenticatedIdentity();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    router.push("/login");
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const userMenu = menuOpen && (
    <>
      <div aria-hidden="true" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40" />
      <div
        role="menu"
        className="absolute top-full right-0 z-50 mt-2 w-52 rounded-xl border border-border bg-background p-1.5 shadow-lg"
      >
        <Link
          href="/portal/perfil"
          role="menuitem"
          onClick={() => setMenuOpen(false)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground/80 hover:bg-foreground/5"
        >
          <UserIcon className="size-4 shrink-0" />
          Mi perfil
        </Link>
        <div className="my-1 border-t border-border" />
        <button
          type="button"
          role="menuitem"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-danger/5"
        >
          <LogOutIcon className="size-4 shrink-0" />
          Salir
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-surface text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="flex items-center justify-center border-b border-border px-4 py-8">
          <Logo />
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-6">
          {PORTAL_NAV_ITEMS.map(({ label, icon: Icon, href }) => {
            const active = label === activeNavLabel;
            return (
              <Link
                key={label}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-foreground/5"
                }`}
              >
                <Icon className="size-5 shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <RoleSwitcher />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop header — same user-menu pattern as shell/header.tsx. */}
        <header className="sticky top-0 z-10 hidden h-20 shrink-0 items-center border-b border-border bg-surface px-4 sm:px-6 md:flex">
          <div className="relative ml-auto">
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

            {userMenu}
          </div>
        </header>

        {/* Mobile header — same user-menu pattern as shell/mobile-header.tsx,
            but with the clinic's own logo instead of Odentia's (see
            CLINIC_LOGO_URL above) — the Patient is interacting with their
            clinic, not the Odentia platform itself. */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- local mock asset, not worth Next/Image's optimization pipeline */}
          <img
            src={CLINIC_LOGO_URL}
            alt={`Logo de ${CURRENT_PATIENT.clinicName}`}
            className="h-9 w-auto shrink-0 object-contain"
          />
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
                {identity.name}
              </span>
              <UserAvatar name={identity.name} initials={identity.initials} avatar_url={identity.avatar_url} sizeClassName="size-8" />
            </button>

            {userMenu}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-[var(--mobile-tabbar-h)] md:pb-0">
          <PageContainer>
            {heading && <h1 className="mb-6 text-[19px] font-semibold text-foreground">{heading}</h1>}
            {children}
          </PageContainer>
        </main>

        <nav
          aria-label="Navegación principal"
          className="fixed inset-x-0 bottom-0 z-40 flex h-[var(--mobile-tabbar-h)] items-stretch border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {PORTAL_NAV_ITEMS.map(({ label, icon: Icon, href }) => {
            const active = label === activeNavLabel;
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px]"
              >
                <Icon className={`size-[22px] ${active ? "text-primary" : "text-foreground/55"}`} />
                {/* Clínica's label is the real clinic name, which can run
                    long — truncate instead of wrapping/overflowing. */}
                <span
                  className={`max-w-full truncate px-0.5 ${active ? "font-medium text-primary" : "text-foreground/55"}`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
