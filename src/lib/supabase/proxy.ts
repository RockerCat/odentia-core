import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideAuthenticatedRedirect } from "@/features/session/decide-authenticated-redirect";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { resolvePatientContext } from "@/features/session/resolve-patient-context";
import { restrictedReasonFor, restrictedReasonForPatient } from "@/features/session/restricted-reason";
import type { ClinicContext, PatientContext } from "@/features/session/types";

// Called from src/proxy.ts (Next.js 16's request-interception convention,
// née "middleware" — see https://nextjs.org/docs/messages/middleware-to-proxy).
//
// Refreshes the Supabase auth session/cookies on every request, and gates
// both the clinic team app's private routes (Agenda/Pacientes/Reportes/
// Clínica/Configuración/Suscripción/Mi perfil profesional) AND the Patient
// Portal's own private routes against the REAL Supabase session. /admin
// (Superadmin) deliberately stays out of this real gate: that role has no
// real auth wired up yet — it keeps the existing mock gate in
// components/shell/use-route-guard.ts unchanged.
//
// Deliberately NO NODE_ENV === "development" bypass here — unlike
// use-route-guard.ts's own mock-session bypass, this real gate must hold
// in `npm run dev` too, so `npm run dev` alone is enough to verify
// unauthenticated/logged-out access actually gets redirected (see the
// follow-up task that removed an earlier version of this bypass). The DEV
// · Cambiar rol switcher (src/dev/role-switcher.tsx) is unaffected: it only
// overrides which mock role/data the already-authorized shell renders,
// never whether a request gets past this gate.
const PRIVATE_CLINIC_PATHS = [
  "/agenda",
  "/pacientes",
  "/reportes",
  "/clinica",
  "/configuracion",
  "/suscripcion",
  "/mi-perfil-profesional",
];

// Explicit leaf paths, not a blanket "/portal" prefix — deliberately
// EXCLUDES /portal/invitacion/[token] (must stay reachable whether
// authenticated or not, same as /invitacion/[token] for staff — someone
// opening a patient invitation link may not have an Odentia account yet)
// and bare /portal (a pure redirect() to /portal/citas, which re-enters
// this same gate on the very next request either way — nothing to protect
// there itself).
const PRIVATE_PATIENT_PATHS = ["/portal/citas", "/portal/salud", "/portal/historia", "/portal/clinica", "/portal/perfil"];

function isPrivateClinicPath(pathname: string): boolean {
  return PRIVATE_CLINIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isPrivatePatientPath(pathname: string): boolean {
  return PRIVATE_PATIENT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function decideClinicRedirect(context: ClinicContext): string | null {
  if (context.status === "ok") return null;
  if (context.status === "unauthenticated") return "/login";
  if (context.status === "no-membership") return "/registro";
  return `/acceso-restringido?motivo=${restrictedReasonFor(context.status)}`;
}

// Mirrors decideClinicRedirect above exactly, but a bare "not-linked" DOES
// escalate to its own honest restricted screen here (unlike
// decideAuthenticatedRedirect's /login-only fallthrough to /registro — see
// that file's own comment) — someone actually trying to REACH the Portal
// with no patient link at all must see "cuenta no vinculada", never a
// silent bounce toward staff onboarding.
function decidePatientRedirect(context: PatientContext): string | null {
  if (context.status === "ok") return null;
  if (context.status === "unauthenticated") return "/login";
  return `/acceso-restringido?motivo=${restrictedReasonForPatient(context.status)}`;
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

  let redirectTo: string | null = null;

  if (pathname === "/login") {
    // Needs both contexts: an already-authenticated visitor could be
    // either real staff or a real linked patient (or neither, or an
    // ambiguous/blocked patient state) — see decideAuthenticatedRedirect's
    // own priority order.
    const [clinicContext, patientContext] = await Promise.all([
      resolveClinicContext(supabase),
      resolvePatientContext(supabase),
    ]);
    if (clinicContext.status !== "unauthenticated") {
      redirectTo = decideAuthenticatedRedirect(clinicContext, patientContext);
    }
  } else if (isPrivateClinicPath(pathname)) {
    redirectTo = decideClinicRedirect(await resolveClinicContext(supabase));
  } else if (isPrivatePatientPath(pathname)) {
    redirectTo = decidePatientRedirect(await resolvePatientContext(supabase));
  }

  if (redirectTo) {
    // Official Supabase SSR redirect pattern: build the redirect from a
    // fresh response, then copy over whatever cookies getClaims() above
    // refreshed on supabaseResponse — a bare NextResponse.redirect(...)
    // on its own would silently drop them.
    const redirectResponse = NextResponse.redirect(new URL(redirectTo, request.url));
    supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie.name, cookie.value));
    return redirectResponse;
  }

  // IMPORTANT: return this exact response object (or copy its cookies onto
  // any replacement) — constructing a fresh NextResponse without doing so
  // drops the refreshed session cookies.
  return supabaseResponse;
}
