import Link from "next/link";
import { Logo } from "@/components/shell/logo";

// Shared public-site navbar — used by the landing page (src/app/page.tsx)
// and every other public marketing page (e.g. /planes) so nav links and
// the CTA buttons never drift between pages. "Funcionalidades" and
// "Marketplace" are anchors into sections on the home page, so they route
// through "/" from any other page. "Registra tu clínica" opens the real
// onboarding wizard at /registro (see src/features/onboarding).
type LandingHeaderProps = {
  active?: "planes";
};

export function LandingHeader({ active }: LandingHeaderProps) {
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
