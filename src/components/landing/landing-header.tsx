"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthenticatedUserMenu } from "@/components/shell/authenticated-user-menu";
import { Logo } from "@/components/shell/logo";
import { useShellLogout } from "@/components/shell/use-shell-logout";
import { useCurrentUserContext } from "@/features/session/use-current-user-context";

// Shared public-site navbar — used by the landing page (src/app/page.tsx)
// and every other public marketing page (e.g. /planes) so nav links and
// the CTA buttons never drift between pages. "Funcionalidades" and
// "Marketplace" are anchors into sections on the home page, so they route
// through "/" from any other page. "Registra tu clínica" opens the real
// onboarding wizard at /registro (see src/features/onboarding).
//
// `showAuthWhenSignedIn` opts a page into replacing those CTAs with the
// real authenticated header block (avatar/clinic/menu, same as the
// authenticated app shell's Header) whenever the visitor already has a
// valid session AND an active clinic membership — see
// useCurrentUserContext()/ClinicContext. Only "/" passes this; /planes
// keeps the plain public header unconditionally, unchanged.
type LandingHeaderProps = {
  active?: "planes";
  showAuthWhenSignedIn?: boolean;
};

export function LandingHeader({ active, showAuthWhenSignedIn = false }: LandingHeaderProps) {
  const router = useRouter();
  // Deliberately does NOT use useShellIdentity() — that hook falls back to
  // the mock identity whenever there's no resolved real context yet, which
  // would flash fake clinic data ("María Gómez"/mock clinic name) to a
  // signed-out visitor. Here we only ever render identity fields once
  // context.status === "ok" below, built straight from the real
  // ClinicContext instead.
  const context = useCurrentUserContext(showAuthWhenSignedIn);
  // redirectTo="/" — signing out from the public landing must stay/return
  // there, never the app shell's own "/login" default (see
  // use-shell-logout.ts).
  const { signOut, signingOut } = useShellLogout("/");

  if (context?.status === "ok") {
    const { profile, clinic, professionalProfile } = context;
    const identity = {
      name: `${profile.firstName} ${profile.lastName}`.trim(),
      initials: `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase(),
      avatar_url: profile.avatarUrl ?? undefined,
      secondaryLabel: clinic.name,
    };

    return (
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo className="h-7 w-auto sm:h-8" />

          <div className="flex items-center gap-1.5 sm:gap-3">
            <Link
              href="/agenda"
              className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:px-4 sm:py-2 sm:text-sm"
            >
              Ir a mi agenda
            </Link>
            <AuthenticatedUserMenu
              identity={identity}
              // A real profile page only exists for a practicing Dentist
              // or a Clinic Admin who already has her own active
              // professional_profile (see CLAUDE.md Domain Model) —
              // /mi-perfil-profesional. Every other case hides "Perfil"
              // rather than inventing a destination, per this task's own
              // "acceso al perfil si ya existe" rule.
              onProfileClick={professionalProfile?.active ? () => router.push("/mi-perfil-profesional") : null}
              onSignOut={() => void signOut()}
              signingOut={signingOut}
            />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo className="h-7 w-auto sm:h-8" />

        <nav className="hidden items-center gap-6 text-sm font-medium text-foreground/80 md:flex">
          <Link href="/#funcionalidades" className="hover:text-foreground">
            Funcionalidades
          </Link>
          <Link href="/#marketplace" className="hover:text-foreground">
            Marketplace
          </Link>
          <Link
            href="/planes"
            className={active === "planes" ? "text-foreground" : "hover:text-foreground"}
          >
            Planes
          </Link>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link
            href="/login"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 sm:border sm:border-border sm:px-4 sm:py-2 sm:text-sm"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/registro"
            className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:px-4 sm:py-2 sm:text-sm"
          >
            Registra tu clínica
          </Link>
        </div>
      </div>
    </header>
  );
}
