import { createClient } from "@/lib/supabase/client";
import type { AccountFormData } from "./types";

export type SignUpOutcome =
  | { status: "signed-in" }
  | { status: "confirmation-required" }
  | { status: "error"; message: string };

// Pure so all three real signup contexts (/registro's own default,
// /invitacion/[token], /portal/invitacion/[token]) are each provably
// covered without mocking Supabase — see api.test.ts. See
// signUpAccount()'s own comment for why this is the real destination
// itself, not a query string this app builds.
export function buildSignUpRedirectTo(origin: string, next: string): string {
  return `${origin}${next}`;
}

export type RegistroReentryDecision = "redirect-to-product" | "redirect-to-portal" | "redirect-to-demo";

// The exact branch behind /registro's reentry check (see
// registro-reentry.tsx's mount effect, the only caller), extracted so
// it's independently testable without a DOM/mocked Supabase client — same
// "pure decide-where-to-go function" convention this codebase already
// uses for decideClinicRedirect/decideAuthenticatedRedirect
// (src/lib/supabase/proxy.ts / src/features/session/
// decide-authenticated-redirect.ts).
//
// "redirect-to-product" (PROMPT NINJA "Bug: /registro queda en bucle")
// replaces what used to be a static "already onboarded" screen whose only
// ways forward were signing out (back to Paso 1, clinic no longer
// visible) or a link to the public marketing page — never into the app
// itself. That was the actual loop: the only way to reach a clinic you
// already had was to sign out and log back in through /login, which DOES
// resolve to /agenda for the identical "has an active membership"
// condition (see decideAuthenticatedRedirect). Reusing that same
// destination here means a stray visit to /registro with a real,
// completed clinic drops the user straight into the product instead of a
// dead end — and, just as importantly, never lets them create a second
// clinic by accident.
//
// "redirect-to-portal" (PROMPT NINJA "Checkpoint 1B — Impedir que un
// Paciente sea enviado al onboarding de clínica"): hasActiveMembership
// alone can't tell a genuinely new staff founder apart from a real
// Patient — a Patient never has a clinic_memberships row at all (see
// CLAUDE.md Domain Model). hasPatientAccess is resolved from
// patient_user_links (via hasAnyPatientLink(), the same real source
// src/lib/supabase/proxy.ts's own decideClinicRedirect and
// decideAuthenticatedRedirect already treat as authoritative for "is this
// account a linked Patient") — never a client-supplied flag. Precedence
// mirrors decideAuthenticatedRedirect exactly: an active clinic
// membership wins first, Patient access is checked only once that's
// ruled out.
//
// "redirect-to-demo" (PROMPT NINJA "Odentia — retirar self-service de
// /registro y eliminar Confirm Signup", 2026-09-21) — replaces the old
// "account"/"clinic" branches now that public self-service clinic
// onboarding is retired (see CLAUDE.md's Domain Model: only a Superadmin
// provisions a clinic). A genuinely new anonymous visitor with no session
// AND an authenticated visitor with neither an active membership nor
// Patient access both land on the same real commercial entry point
// (/demo) — there is no clinic-creation UI left anywhere in this app for
// either case to fall through to.
export function decideRegistroReentry(
  hasSession: boolean,
  hasActiveMembership: boolean,
  hasPatientAccess: boolean,
): RegistroReentryDecision {
  if (!hasSession) return "redirect-to-demo";
  if (hasActiveMembership) return "redirect-to-product";
  if (hasPatientAccess) return "redirect-to-portal";
  return "redirect-to-demo";
}

// Real Supabase Auth signup — the traditional AccountStep path. Its ONE
// real remaining caller is /invitacion/[token]'s own traditional branch
// for a Clinic-Admin-issued invitation with no pre-provisioned identity —
// either a genuinely historical one created before "Unify clinic team
// invitation activation" (7 real such pending invitations existed at that
// checkpoint's own close, confirmed by direct query — never assume that
// count is zero without re-checking), or the defensive fallback if that
// migration's own identity requirement were ever somehow bypassed.
// /portal/invitacion/[token] (Patient) never calls this at all — always
// password-only. /registro's own Paso 1 no longer calls this either — see
// "Odentia — retirar self-service de /registro y eliminar Confirm
// Signup": public self-service clinic onboarding is retired; a genuinely
// new anonymous visitor is sent to /demo instead (see
// registro-reentry.tsx). Do not remove this function while
// /invitacion/[token]'s traditional branch still has real, live
// invitations depending on it. first_name/last_name travel in
// user_metadata; the on_auth_user_created trigger (see the foundation
// schema migration) is what actually creates the profiles row — never
// insert into profiles from the client.
export async function signUpAccount(data: AccountFormData, next: string = "/registro"): Promise<SignUpOutcome> {
  const supabase = createClient();
  const { data: result, error } = await supabase.auth.signUp({
    email: data.email.trim(),
    password: data.password,
    options: {
      data: {
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
      },
      // Points directly at the real post-confirm destination (/registro,
      // or the Equipo/Patient Portal invitation this signup started from —
      // see src/app/invitacion/[token]/page.tsx and
      // src/app/portal/invitacion/[token]/page.tsx) — NOT at
      // /auth/confirm?next=... the way this used to be built. That old
      // shape relied on Supabase's default {{ .ConfirmationURL }} template
      // variable, which is known not to propagate emailRedirectTo through
      // for a PKCE-flow signup (this app forces PKCE — see
      // src/lib/supabase/client.ts), and separately broke again once the
      // Confirm Signup template was hand-edited to embed
      // {{ .RedirectTo }} as a URL PREFIX: {{ .RedirectTo }} either
      // already contained its own "?next=..." query string (making
      // "&token_hash=..." invalid without a second "?") or, if the
      // Redirect URLs allow-list ever rejected it, silently collapsed to
      // bare {{ .SiteURL }} with no path/query at all — either way,
      // GoTrue's own /auth/v1/verify hop is never actually involved here
      // (this route handles token_hash+type via verifyOtp() directly), so
      // emailRedirectTo's ONLY job is supplying {{ .RedirectTo }}'s value.
      //
      // Sending the real destination directly sidesteps both failure
      // modes: the REQUIRED Confirm Signup template is now
      //   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
      // — a fixed, always-well-formed prefix with {{ .RedirectTo }} used
      // only as a VALUE, never as a URL a query string gets appended onto.
      // resolveSafeNext() (src/app/auth/confirm/resolve-safe-next.ts) turns
      // that value — a same-origin absolute URL when the allow-list
      // accepted it, or a bare origin if it didn't — back into a safe
      // relative path, defaulting to /registro either way if nothing
      // usable survives. Dynamic origin (not hardcoded), so this keeps
      // working in local dev and whatever domain this app is actually
      // deployed to, as long as that destination is covered by Supabase
      // Auth's Redirect URLs allow-list (Dashboard → Authentication → URL
      // Configuration) — e.g. a single `<origin>/**` entry.
      emailRedirectTo: buildSignUpRedirectTo(window.location.origin, next),
    },
  });

  if (error) return { status: "error", message: friendlySignUpError(error.message) };
  if (result.session) return { status: "signed-in" };
  return { status: "confirmation-required" };
}

function friendlySignUpError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "Ya existe una cuenta con este correo. Intenta iniciar sesión o usa otro correo.";
  }
  if (normalized.includes("password")) {
    return "La contraseña no cumple los requisitos de seguridad. Intenta con otra.";
  }
  return "No pudimos crear tu cuenta. Intenta de nuevo en unos minutos.";
}

// Reentry: does the currently authenticated user already belong to an
// active clinic? Used by registro-reentry.tsx's own mount check
// (decideRegistroReentry above) to route to /agenda instead of /demo.
export async function findActiveMembership(): Promise<{ found: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { found: false };

  const { data, error } = await supabase
    .from("clinic_memberships")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return { found: data !== null };
}

// tax_id (RIPS #3's clinics_tax_id_format CHECK: digits only, 4-12 chars)
// needs the SAME normalization src/features/clinic/actions.ts's
// updateClinicInfo() already applies for the exact same column — strip
// everything but digits, empty → null. Real callers today: Platform's own
// clinic provisioning (src/features/platform/api.ts, src/features/
// platform/clinic-form.tsx) and the commercial-prospects conversion form
// — /registro's own bootstrap_clinic() call site that originally needed
// this was retired in "Odentia — retirar self-service de /registro y
// eliminar Confirm Signup" (bootstrap_clinic() itself is untouched,
// legacy/no product callers — see that checkpoint's own report).
export const sanitizeTaxId = (value: string) => value.replace(/[^0-9]/g, "") || null;

// Mirrors clinics_tax_id_format's own bounds exactly (RIPS #3 migration —
// Documento Técnico 1 field T01: "tamaño 4-12"). sanitizeTaxId() already
// guarantees a digits-only result, so length is the ONLY way a sanitized
// value can still violate that CHECK — a short QA placeholder ("123") or
// an accidentally-pasted longer number (a phone number with country
// code, say) both sanitize to an all-digit string outside [4, 12]. Same
// real callers as sanitizeTaxId() above.
const TAX_ID_MIN_LENGTH = 4;
const TAX_ID_MAX_LENGTH = 12;

export function isValidTaxIdLength(sanitized: string | null): boolean {
  return sanitized === null || (sanitized.length >= TAX_ID_MIN_LENGTH && sanitized.length <= TAX_ID_MAX_LENGTH);
}
