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
  "/rips",
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

// F001 fix: "no-membership" used to mean one thing only — a genuinely new
// account that still needs onboarding — and always sent them to
// /registro. But a real, authenticated PATIENT hitting a staff-only route
// (direct URL, hard refresh, bookmark) *also* has no clinic membership —
// she was never meant to have one — so she was landing on /registro's own
// onboarding wizard, about to create a brand-new clinic, instead of being
// sent back to her own Portal. Not a security hole (she never sees clinic
// data), just the wrong destination. `isLinkedPatient` disambiguates the
// two: only ever computed by the caller when status is actually
// "no-membership" (see updateSession below), so a real staff member's
// request never pays for an extra resolvePatientContext() lookup it
// doesn't need. A genuinely unlinked, non-staff account (isLinkedPatient
// stays false) keeps landing on /registro exactly as before.
export function decideClinicRedirect(context: ClinicContext, isLinkedPatient: boolean): string | null {
  if (context.status === "ok") return null;
  if (context.status === "unauthenticated") return "/login";
  if (context.status === "no-membership") return isLinkedPatient ? "/portal" : "/registro";
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

// Supabase's default hosted email template ({{ .ConfirmationURL }})
// doesn't thread emailRedirectTo through for a PKCE-flow signup (see
// signUpAccount(), src/features/onboarding/api.ts) — without Custom SMTP
// we can't hand-edit that template yet, so the confirmation link lands the
// browser on Site URL itself with the PKCE `code` appended (`/?code=...`)
// instead of `/auth/confirm`, where the real exchangeCodeForSession()
// exchange actually lives. This is the minimal, safe fallback: hand the
// SAME code on to the real handler, server-side, before the landing page
// ever renders — never a second exchange implementation, never rewriting
// /auth/confirm/route.ts itself (it already handles a bare `code` +
// `next` exactly like this).
//
// `next` is deliberately NEVER read from the incoming request — there is
// nothing legitimate to read it from here (Supabase's own redirect to `/`
// only ever carries `code`, nothing else) — always the real signup's own
// default, `/registro`, a literal hardcoded destination. Open-redirect-
// proof by construction, not by validation: there is no external input
// this function could forward even if it wanted to.
//
// A pure function (no request/response objects) so this exact decision is
// unit-testable without mocking NextRequest/Supabase — see
// decide-root-code-redirect.test.ts.
export function decideRootCodeRedirect(code: string | null): string | null {
  if (!code) return null;
  return `/auth/confirm?code=${encodeURIComponent(code)}&next=/registro`;
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
    const clinicContext = await resolveClinicContext(supabase);
    // Only resolved when it can actually change the outcome — see
    // decideClinicRedirect's own comment.
    const isLinkedPatient =
      clinicContext.status === "no-membership" && (await resolvePatientContext(supabase)).status === "ok";
    redirectTo = decideClinicRedirect(clinicContext, isLinkedPatient);
  } else if (isPrivatePatientPath(pathname)) {
    redirectTo = decidePatientRedirect(await resolvePatientContext(supabase));
  } else if (pathname === "/") {
    // Only ever activates when Supabase's own redirect actually carried a
    // `code` — a plain visit to "/" (no query params) falls through this
    // branch with redirectTo still null, same as before this existed, so
    // the landing page renders completely unmodified either way.
    redirectTo = decideRootCodeRedirect(request.nextUrl.searchParams.get("code"));
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
