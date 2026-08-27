import { createClient } from "@/lib/supabase/client";
import { uploadClinicLogo as uploadClinicLogoFile } from "@/features/clinic/logo";
import { slugCandidate, slugifyClinicName } from "./slug";
import type { AccountFormData, ClinicFormData, ClinicLocationData, ClinicLogo, RoleFormData } from "./types";

const MAX_SLUG_ATTEMPTS = 5;

export type SignUpOutcome =
  | { status: "signed-in" }
  | { status: "confirmation-required" }
  | { status: "error"; message: string };

// Paso 1 — real Supabase Auth signup. first_name/last_name travel in
// user_metadata; the on_auth_user_created trigger (see the foundation
// schema migration) is what actually creates the profiles row — never
// insert into profiles from the client.
export async function signUpAccount(data: AccountFormData): Promise<SignUpOutcome> {
  const supabase = createClient();
  const { data: result, error } = await supabase.auth.signUp({
    email: data.email.trim(),
    password: data.password,
    options: {
      data: {
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
      },
      // Points at the server-side confirmation route (see
      // src/app/auth/confirm/route.ts), not directly at /registro — that
      // route is what actually establishes the SSR session via cookies
      // before handing back to the wizard; relying on the browser client
      // to detect a session from the URL on its own is fragile here (a
      // Server Component page can't process it, and this app is
      // server-rendered). Dynamic origin rather than a hardcoded/guessed
      // domain, so this works unmodified in local dev and whatever domain
      // this app is actually deployed to — as long as that origin is
      // present in Supabase Auth's Redirect URLs allow-list (Dashboard →
      // Authentication → URL Configuration).
      emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/registro")}`,
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
      clinic_tax_id: nullIfEmpty(clinic.taxId),
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
