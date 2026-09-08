"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { RoleProvider } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { RoleSwitcher } from "@/dev/role-switcher"; // DEV TOOL — see src/dev/role.ts
import { usePatientContext } from "@/features/session/use-patient-context";
import { BuildingIcon, CalendarIcon, ChevronDownIcon, LogOutIcon, NoteIcon, ToothIcon, UserIcon } from "./icons";
import { NavLinkContent } from "./nav-link-status";
import { PageContainer } from "./page-container";
import { useRouteGuard } from "./use-route-guard";
import { useShellLogout } from "./use-shell-logout";

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
// useRouteGuard(["patient"]) is unchanged from before — same layered "dev-
// convenience + hydration-safe nav gate on top of the real server-side
// gate" role every other shell already plays (see AppShell's own identical
// use), now correctly recognizing a real Patient because
// bridgePatientContextIntoMockSession (see src/app/login/page.tsx) writes
// "patient" into the same mock session at login. The REAL authorization
// boundary is src/lib/supabase/proxy.ts's own /portal/* gate
// (resolvePatientContext) plus RLS — this hook (and usePatientContext
// below) never assumes otherwise.
//
// Identity (name/avatar, clinic name/logo) is real — usePatientContext()
// (src/features/session/use-patient-context.ts), same "purely for
// display, proxy.ts already gated the route" contract as
// useShellIdentity()/useCurrentUserContext() for the clinic-side Header.
// While it's still resolving (a brief window right after proxy.ts's own
// already-gated navigation), the header shows a neutral loading state —
// never the old mock CURRENT_PATIENT as a fallback.
//
// Odentia's own logo never appears anywhere in the Patient portal (mobile
// header or desktop sidebar) — the Patient is interacting with their
// clinic, not the Odentia platform itself; Odentia stays the backoffice
// behind the scenes (see CLAUDE.md). Falls back to the same neutral local
// asset only when the clinic has no real logo_url of its own — never a
// wrong/unrelated clinic's branding.
const FALLBACK_CLINIC_LOGO_URL = "/branding/sonrisa_perfecta.png";

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
  const context = usePatientContext();
  const { signOut, signingOut } = useShellLogout();
  const [menuOpen, setMenuOpen] = useState(false);

  const clinicName = context?.status === "ok" ? context.clinic.name : "";
  const clinicLogoUrl = (context?.status === "ok" ? context.clinic.logoUrl : null) ?? FALLBACK_CLINIC_LOGO_URL;
  const patientName =
    context?.status === "ok" ? `${context.patient.firstName} ${context.patient.lastName}`.trim() : "";
  // Neutral, honest loading label — usePatientContext() is still resolving
  // for the brief window right after proxy.ts's own already-gated
  // navigation; never the old mock CURRENT_PATIENT name as a filler.
  const displayName = patientName || "Cargando…";
  const initials =
    context?.status === "ok"
      ? (`${context.patient.firstName[0] ?? ""}${context.patient.lastName[0] ?? ""}`.toUpperCase() || "?")
      : "";
  const avatarUrl = context?.status === "ok" ? (context.profile.avatarUrl ?? undefined) : undefined;
  const secondaryLabel = context?.status === "ok" ? `Paciente · ${context.clinic.name}` : "";

  const portalNavItems = [
    { label: "Mis citas", icon: CalendarIcon, href: "/portal/citas" },
    { label: "Mi salud dental", icon: ToothIcon, href: "/portal/salud" },
    { label: "Mi Historia Clínica", icon: NoteIcon, href: "/portal/historia" },
    { label: clinicName || "Mi clínica", icon: BuildingIcon, href: "/portal/clinica" },
  ];

  const handleLogout = () => {
    setMenuOpen(false);
    void signOut();
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
          disabled={signingOut}
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-danger/5 disabled:opacity-60"
        >
          <LogOutIcon className="size-4 shrink-0" />
          {signingOut ? "Cerrando sesión…" : "Salir"}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-surface text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="flex items-center justify-center border-b border-border px-4 py-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote/local clinic asset, not worth Next/Image's optimization pipeline */}
          <img
            src={clinicLogoUrl}
            alt={clinicName ? `Logo de ${clinicName}` : "Logo de la clínica"}
            className="h-14 w-auto max-w-[180px] object-contain"
          />
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-6">
          {portalNavItems.map(({ label, icon: Icon, href }) => {
            const active = label === activeNavLabel;
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-foreground/5"
                }`}
              >
                <NavLinkContent className="flex flex-1 items-center gap-3">
                  <Icon className="size-5 shrink-0" />
                  <span>{label}</span>
                </NavLinkContent>
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
              <UserAvatar name={displayName} initials={initials} avatar_url={avatarUrl} />
              <span className="hidden text-left sm:block">
                <span className="block text-sm leading-tight font-medium">{displayName}</span>
                <span className="block text-xs leading-tight text-muted-foreground">{secondaryLabel}</span>
              </span>
              <ChevronDownIcon className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
            </button>

            {userMenu}
          </div>
        </header>

        {/* Mobile header — same user-menu pattern as shell/mobile-header.tsx,
            but with the clinic's own logo instead of Odentia's (see
            FALLBACK_CLINIC_LOGO_URL above) — the Patient is interacting
            with their clinic, not the Odentia platform itself. */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote/local clinic asset, not worth Next/Image's optimization pipeline */}
          <img
            src={clinicLogoUrl}
            alt={clinicName ? `Logo de ${clinicName}` : "Logo de la clínica"}
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
                {displayName}
              </span>
              <UserAvatar name={displayName} initials={initials} avatar_url={avatarUrl} sizeClassName="size-8" />
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
          {portalNavItems.map(({ label, icon: Icon, href }) => {
            const active = label === activeNavLabel;
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px]"
              >
                <NavLinkContent className="flex flex-1 min-w-0 flex-col items-center justify-center gap-1">
                  <Icon className={`size-[22px] ${active ? "text-primary" : "text-foreground/55"}`} />
                  {/* Clínica's label is the real clinic name, which can run
                      long — truncate instead of wrapping/overflowing. */}
                  <span
                    className={`max-w-full truncate px-0.5 ${active ? "font-medium text-primary" : "text-foreground/55"}`}
                  >
                    {label}
                  </span>
                </NavLinkContent>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
