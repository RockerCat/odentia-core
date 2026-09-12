import { createClient } from "@/lib/supabase/client";
import { uploadClinicLogo as uploadClinicLogoFile } from "@/features/clinic/logo";
import type { SignOutOutcome } from "@/features/session/sign-out";
import { slugCandidate, slugifyClinicName } from "./slug";
import type { AccountFormData, ClinicFormData, ClinicLocationData, ClinicLogo, RoleFormData } from "./types";

const MAX_SLUG_ATTEMPTS = 5;

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

export type RegistroReentryDecision = "account" | "clinic" | "redirect-to-product";

// The exact 3-way branch behind /registro's reentry check (see
// onboarding-wizard.tsx's mount effect, the only caller), extracted so
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
export function decideRegistroReentry(hasSession: boolean, hasActiveMembership: boolean): RegistroReentryDecision {
  if (!hasSession) return "account";
  if (hasActiveMembership) return "redirect-to-product";
  return "clinic";
}

export type AfterSignOutAction = "navigate-to-login" | "show-error";

// PROMPT NINJA "Retirar debug temporal y permitir cerrar sesión desde
// onboarding" — the same "pure decide-what-the-UI-does-next" convention as
// decideRegistroReentry above, so "success navigates, failure shows an
// error and never navigates" is independently testable without rendering
// onboarding-wizard.tsx. signOutSupabase() (src/features/session/
// sign-out.ts) already degrades safely on a transient server-side error
// (auth-js clears the local session regardless) for the app shell's own
// "Salir" — but a user stuck on /registro with the WRONG account has no
// other screen to retry from, so this call site deliberately does NOT
// navigate on error and surfaces it instead, rather than assuming success.
export function decideAfterSignOut(outcome: SignOutOutcome): AfterSignOutAction {
  return outcome.status === "ok" ? "navigate-to-login" : "show-error";
}

// Paso 1 — real Supabase Auth signup. first_name/last_name travel in
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

// Reentry (see CLAUDE.md task scope, section 7): does the currently
// authenticated user already belong to an active clinic? Used both to
// resume an incomplete onboarding at Paso 2 (no membership yet) and to
// refuse creating a second clinic from /registro (membership found).
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

const nullIfEmpty = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

// tax_id (RIPS #3's clinics_tax_id_format CHECK: digits only, 4-12 chars)
// needs the SAME normalization src/features/clinic/actions.ts's
// updateClinicInfo() already applies for the exact same column — strip
// everything but digits, empty → null. Missing here (bootstrap_clinic is
// a separate write path, added before that check existed) meant a real
// Colombian NIT typed with its customary "-DV" check-digit suffix (e.g.
// "900123456-7") made the RPC's INSERT fail the constraint, surfaced to
// the user only as the generic "No pudimos crear tu clínica" message.
export const sanitizeTaxId = (value: string) => value.replace(/[^0-9]/g, "") || null;

// Mirrors clinics_tax_id_format's own bounds exactly (RIPS #3 migration —
// Documento Técnico 1 field T01: "tamaño 4-12"). sanitizeTaxId() already
// guarantees a digits-only result, so length is the ONLY way a sanitized
// value can still violate that CHECK — a short QA placeholder ("123") or
// an accidentally-pasted longer number (a phone number with country
// code, say) both sanitize to an all-digit string outside [4, 12].
// Exported so clinic-step.tsx can reject those BEFORE bootstrap_clinic()
// ever runs, instead of surfacing a raw 23514 as the generic "no pudimos
// crear tu clínica" — same bounds, checked in exactly one place.
const TAX_ID_MIN_LENGTH = 4;
const TAX_ID_MAX_LENGTH = 12;

export function isValidTaxIdLength(sanitized: string | null): boolean {
  return sanitized === null || (sanitized.length >= TAX_ID_MIN_LENGTH && sanitized.length <= TAX_ID_MAX_LENGTH);
}

export type BootstrapResult = {
  clinicId: string;
  slug: string;
};

// Paso 3 — the one sanctioned path past RLS's deny-by-default on
// clinics/clinic_locations/clinic_memberships/professional_profiles INSERT
// (see the bootstrap_clinic migration). Retries with a numbered slug
// suffix only on an actual unique_violation from clinics.slug — the DB
// stays the single source of truth for uniqueness (see slug.ts).
export async function bootstrapClinic(
  clinic: ClinicFormData,
  location: ClinicLocationData,
  role: RoleFormData,
): Promise<BootstrapResult> {
  const supabase = createClient();
  const baseSlug = slugifyClinicName(clinic.name);
  const isDentist = role.workMode === "admin-dentist";

  let lastError: { code?: string; message: string } | null = null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc("bootstrap_clinic", {
      clinic_name: clinic.name.trim(),
      clinic_slug: slugCandidate(baseSlug, attempt),
      clinic_legal_name: nullIfEmpty(clinic.legalName),
      clinic_tax_id: sanitizeTaxId(clinic.taxId),
      clinic_email: nullIfEmpty(clinic.institutionalEmail),
      clinic_phone: nullIfEmpty(clinic.phone),
      clinic_logo_url: null,
      location_name: "Sede principal",
      location_address: nullIfEmpty(location.locationAddress),
      location_city: nullIfEmpty(location.locationCity),
      location_state: nullIfEmpty(location.locationState),
      location_country: "CO",
      location_phone: nullIfEmpty(clinic.phone),
      location_timezone: "America/Bogota",
      is_dentist: isDentist,
      primary_specialty_id: null,
      license_number: isDentist ? nullIfEmpty(role.registrationNumber) : null,
      agenda_color: null,
      default_appointment_duration_minutes: isDentist ? Number(role.appointmentDuration) : null,
      bio: null,
      // Both null (no pin — Nominatim found nothing, or the user never
      // clicked "Ubicar en el mapa") or both a real number (a geocoded or
      // manually-dragged pin) — see ClinicLocationData in types.ts and the
      // both-or-neither constraint/check added on the DB side in this
      // task's migration. Never sent as separate optional fields that
      // could drift out of sync.
      location_latitude: location.locationLatitude,
      location_longitude: location.locationLongitude,
    });

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      return { clinicId: row.clinic_id, slug: row.slug };
    }

    if (error.code === "23505" && error.message.includes("clinics_slug_key")) {
      lastError = error;
      continue;
    }

    throw error;
  }

  throw lastError ?? new Error("No se pudo generar un identificador único para la clínica.");
}

export function friendlyBootstrapError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    if (message.includes("session")) {
      return "Tu sesión expiró. Recarga la página e inicia sesión de nuevo para continuar.";
    }
  }
  return "No pudimos crear tu clínica. Intenta de nuevo en unos minutos.";
}

export type LogoUploadOutcome = { logoUrl: string } | { failed: true };

// Only called once bootstrap_clinic() has returned a real clinicId — the
// storage path is <clinic_id>/logo.<ext> (see the clinic-logos Storage
// migration), which can't exist before the clinic does. A failure here is
// deliberately non-fatal to the caller (see onboarding-wizard.tsx): the
// clinic itself is already created successfully by this point. Thin
// wrapper: the actual upload/logo_url update is shared with /clinica's own
// "cambiar logo" (see src/features/clinic/logo.ts) — never duplicated.
export async function uploadClinicLogo(clinicId: string, logo: ClinicLogo): Promise<LogoUploadOutcome> {
  if (!logo.file) return { failed: true };
  return uploadClinicLogoFile(clinicId, logo.file);
}
