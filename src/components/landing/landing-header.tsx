"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthenticatedUserMenu } from "@/components/shell/authenticated-user-menu";
import { LandingCtaLink } from "@/components/landing/landing-cta-link";
import { Logo } from "@/components/shell/logo";
import { useShellLogout } from "@/components/shell/use-shell-logout";
import type { ClinicContext } from "@/features/session/types";

// Shared public-site navbar — used by the landing page (src/app/page.tsx)
// and every other public marketing page (e.g. /planes) so nav links and
// the CTA buttons never drift between pages. The logo itself always links
// to "/" (same aria-label convention as onboarding-wizard.tsx's own
// logo-links-home) in both branches below — real navigation, not a static
// image. "Funcionalidades" and "Marketplace" are anchors into sections on
// the home page, so they route through "/" from any other page. "Quiero
// Odentia para mi clínica" opens
// the minimal commercial landing at /demo (see src/app/demo/page.tsx) —
// Odentia's commercial model is now assisted onboarding (Landing →
// intención comercial → prospecto → seguimiento comercial → conversión
// por Superadmin), never public self-service clinic creation. "demo" is
// deliberately not part of this CTA's own wording — it stays true as the
// implementation URL and inside /demo's own explanatory copy, never the
// primary visible concept. /registro still exists and is unchanged (real
// Auth/reentry infrastructure — email confirmation fallback, PKCE
// recovery, proxy.ts's own no-membership fallback), it's just no longer
// the commercial entry point this header advertises.
//
// `authContext` opts a page into replacing those CTAs with the real
// authenticated header block (avatar/clinic/menu, same as the
// authenticated app shell's Header) whenever it's an active clinic
// membership's ClinicContext (status "ok"). Only "/" passes this,
// resolved server-side (see src/app/page.tsx) via the same
// resolveClinicContext() every other real feature uses, so the
// authenticated header is already correct in the FIRST render — no
// client-side fetch, no flash of the public CTAs for a signed-in visitor.
// /planes keeps the plain public header unconditionally, unchanged, by
// simply never passing this prop.
type LandingHeaderProps = {
  active?: "planes";
  authContext?: ClinicContext | null;
};

export function LandingHeader({ active, authContext = null }: LandingHeaderProps) {
  const router = useRouter();
  // Coordinated logout (see use-shell-logout.ts): every real "Salir"
  // click, from any caller, now ends at the same place via Marketplace's
  // own cleanup hop — there is no longer a distinct "/" destination for
  // this landing header to ask for.
  const { signOut, signingOut } = useShellLogout();

  if (authContext?.status === "ok") {
    const { profile, clinic, professionalProfile } = authContext;
    const identity = {
      name: `${profile.firstName} ${profile.lastName}`.trim(),
      initials: `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase(),
      avatar_url: profile.avatarUrl ?? undefined,
      secondaryLabel: clinic.name,
    };

    return (
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Ir al inicio de Odentia">
            <Logo className="h-7 w-auto sm:h-8" />
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <LandingCtaLink
              href="/agenda"
              className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:px-4 sm:py-2 sm:text-sm"
            >
              Ir a mi clínica
            </LandingCtaLink>
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
        <Link href="/" aria-label="Ir al inicio de Odentia">
          <Logo className="h-7 w-auto sm:h-8" />
        </Link>

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
          <LandingCtaLink
            href="/login"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 sm:border sm:border-border sm:px-4 sm:py-2 sm:text-sm"
          >
            Iniciar sesión
          </LandingCtaLink>
          <LandingCtaLink
            href="/demo"
            className="rounded-lg bg-primary px-2.5 py-1.5 text-center text-xs font-medium text-primary-foreground hover:opacity-90 sm:px-4 sm:py-2 sm:text-sm"
          >
            Quiero Odentia para mi clínica
          </LandingCtaLink>
        </div>
      </div>
    </header>
  );
}
