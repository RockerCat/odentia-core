import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { restrictedReasonFor } from "@/features/session/restricted-reason";
import type { ClinicContext } from "@/features/session/types";

// Called from src/proxy.ts (Next.js 16's request-interception convention,
// née "middleware" — see https://nextjs.org/docs/messages/middleware-to-proxy).
//
// Refreshes the Supabase auth session/cookies on every request, and gates
// the clinic team app's private routes (Agenda/Pacientes/Reportes/Clínica/
// Configuración/Suscripción) against the REAL Supabase session — see
// CLAUDE.md task scope, section 7. /admin (Superadmin) and /portal
// (Patient) deliberately stay out of this real gate: neither role has real
// auth wired up yet (see task scope, sections 14/19) — they keep the
// existing mock gate in components/shell/use-route-guard.ts unchanged.
//
// Deliberately NO NODE_ENV === "development" bypass here — unlike
// use-route-guard.ts's own mock-session bypass, this real gate must hold
// in `npm run dev` too, so `npm run dev` alone is enough to verify
// unauthenticated/logged-out access actually gets redirected (see the
// follow-up task that removed an earlier version of this bypass). The DEV
// · Cambiar rol switcher (src/dev/role-switcher.tsx) is unaffected: it only
// overrides which mock role/data the already-authorized shell renders,
// never whether a request gets past this gate.
const PRIVATE_CLINIC_PATHS = ["/agenda", "/pacientes", "/reportes", "/clinica", "/configuracion", "/suscripcion"];

function isPrivateClinicPath(pathname: string): boolean {
  return PRIVATE_CLINIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function decideRedirect(pathname: string, context: ClinicContext): string | null {
  if (pathname === "/login") {
    if (context.status === "ok") return "/agenda";
    if (context.status === "no-membership") return "/registro";
    if (context.status === "unauthenticated") return null;
    return `/acceso-restringido?motivo=${restrictedReasonFor(context.status)}`;
  }

  // Private clinic path.
  if (context.status === "ok") return null;
  if (context.status === "unauthenticated") return "/login";
  if (context.status === "no-membership") return "/registro";
  return `/acceso-restringido?motivo=${restrictedReasonFor(context.status)}`;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // With Fluid compute, don't put this client in a global variable —
  // always create a new one per request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(): skipping or
  // reordering this call is what causes users to get randomly logged out
  // with SSR.
  await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;
  const needsGate = pathname === "/login" || isPrivateClinicPath(pathname);

  if (needsGate) {
    const context = await resolveClinicContext(supabase);
    const redirectTo = decideRedirect(pathname, context);
    if (redirectTo) {
      // Official Supabase SSR redirect pattern: build the redirect from a
      // fresh response, then copy over whatever cookies getClaims() above
      // refreshed on supabaseResponse — a bare NextResponse.redirect(...)
      // on its own would silently drop them.
      const redirectResponse = NextResponse.redirect(new URL(redirectTo, request.url));
      supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie.name, cookie.value));
      return redirectResponse;
    }
  }

  // IMPORTANT: return this exact response object (or copy its cookies onto
  // any replacement) — constructing a fresh NextResponse without doing so
  // drops the refreshed session cookies.
  return supabaseResponse;
}
