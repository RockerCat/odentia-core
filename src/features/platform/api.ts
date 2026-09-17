import { createClient } from "@/lib/supabase/client";
import type { TeamMemberRole } from "@/features/clinic/data";
import { isValidTaxIdLength, sanitizeTaxId } from "@/features/onboarding/api";
import { slugCandidate, slugifyClinicName } from "@/features/onboarding/slug";
import type { ClinicFormData, ClinicLocationData } from "@/features/onboarding/types";

const MAX_SLUG_ATTEMPTS = 5;

const nullIfEmpty = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export type ProvisionClinicResult = {
  clinicId: string;
  slug: string;
};

// Superadmin-only clinic creation (Checkpoint 3: Platform → Clínicas →
// Nueva clínica). Calls provision_clinic() — a SEPARATE RPC from
// onboarding's own bootstrap_clinic(), never that one — because
// bootstrap_clinic() unconditionally makes its caller a clinic_admin
// member of the clinic it creates, which is exactly wrong here: a
// Superadmin provisioning a clinic for a customer must never become an
// artificial member of it (see the migration's own comment). Reuses
// isValidTaxIdLength/sanitizeTaxId (same validation the onboarding wizard
// already applies before its own RPC call) and slugifyClinicName/
// slugCandidate (same client-side slug-candidate-with-retry convention as
// bootstrapClinic() in src/features/onboarding/api.ts) — never a second,
// diverging implementation of either.
export async function provisionClinic(clinic: ClinicFormData, location: ClinicLocationData): Promise<ProvisionClinicResult> {
  const supabase = createClient();
  const baseSlug = slugifyClinicName(clinic.name);

  let lastError: { code?: string; message: string } | null = null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc("provision_clinic", {
      clinic_name: clinic.name.trim(),
      clinic_slug: slugCandidate(baseSlug, attempt),
      clinic_legal_name: nullIfEmpty(clinic.legalName),
      clinic_tax_id: sanitizeTaxId(clinic.taxId),
      clinic_email: nullIfEmpty(clinic.institutionalEmail),
      clinic_phone: nullIfEmpty(clinic.phone),
      location_name: "Sede principal",
      location_address: nullIfEmpty(location.locationAddress),
      location_city: nullIfEmpty(location.locationCity),
      location_state: nullIfEmpty(location.locationState),
      location_country: "CO",
      location_phone: nullIfEmpty(clinic.phone),
      location_timezone: "America/Bogota",
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

// Re-exported so the admin form can apply the exact same NIT validation
// the onboarding wizard's own clinic-step.tsx does, without a second
// import path to remember at every call site.
export { isValidTaxIdLength, sanitizeTaxId };

export function friendlyProvisionError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    if (message.includes("session")) {
      return "Tu sesión expiró. Recarga la página e inicia sesión de nuevo para continuar.";
    }
    if (message.includes("superadmin")) {
      return "No tienes permisos de Superadmin para crear una clínica.";
    }
  }
  return "No pudimos crear la clínica. Intenta de nuevo en unos minutos.";
}

export type ProvisionFirstClinicAdminInvitationInput = {
  clinicId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type ProvisionFirstClinicAdminInvitationResult = {
  id: string;
  clinicId: string;
  email: string;
  expiresAt: string;
  // Only ever present in this one response — never stored anywhere,
  // never re-fetchable later (only its hash is persisted). Same
  // never-shown-twice convention as inviteClinicMember()'s own rawToken.
  rawToken: string;
};

// "Platform — Asignar primer Administrador de Clínica". Calls
// provision_first_clinic_admin_invitation() (20260916150000) — a SEPARATE
// RPC from inviteClinicMember()'s invite_clinic_member(), never that one:
// this is Superadmin-authorized (is_platform_superadmin(), checked
// server-side inside the RPC) rather than caller-membership-authorized,
// clinic_id is an explicit parameter (a Superadmin has no membership of
// her own to derive it from), and role is hardcoded 'clinic_admin'
// server-side — never a parameter this wrapper could send.
export async function provisionFirstClinicAdminInvitation(
  input: ProvisionFirstClinicAdminInvitationInput,
): Promise<ProvisionFirstClinicAdminInvitationResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("provision_first_clinic_admin_invitation", {
    p_clinic_id: input.clinicId,
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim(),
    p_email: input.email.trim(),
    p_phone: input.phone.trim(),
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return { id: row.id, clinicId: row.clinic_id, email: row.email, expiresAt: row.expires_at, rawToken: row.raw_token };
}

// Mirrors friendlyProvisionError()'s own shape/tone, scoped to this RPC's
// distinct rejection cases (see provision_first_clinic_admin_invitation()'s
// own comments for the exact raise exception text each of these matches).
export function friendlyProvisionAdminError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    if (message.includes("session")) {
      return "Tu sesión expiró. Recarga la página e inicia sesión de nuevo para continuar.";
    }
    if (message.includes("superadmin")) {
      return "No tienes permisos de Superadmin para asignar un Administrador de Clínica.";
    }
    if (message.includes("clinic not found")) {
      return "No encontramos esta clínica. Recarga la página e intenta de nuevo.";
    }
    if (message.includes("already has an active clinic_admin")) {
      return "Esta clínica ya tiene un Administrador de Clínica activo.";
    }
    if (message.includes("already has a pending clinic_admin invitation")) {
      return "Ya existe una invitación pendiente para el primer Administrador de esta clínica.";
    }
    if (message.includes("first_name must not be empty")) {
      return "Ingresa el nombre.";
    }
    if (message.includes("last_name must not be empty")) {
      return "Ingresa el apellido.";
    }
    if (message.includes("phone must not be empty")) {
      return "Ingresa el teléfono.";
    }
    if (message.includes("valid email")) {
      return "Ingresa un correo electrónico válido.";
    }
  }
  return "No pudimos crear la invitación. Intenta de nuevo en unos minutos.";
}

export type ProvisionClinicTeamMemberInput = {
  clinicId: string;
  role: TeamMemberRole;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type ProvisionClinicTeamMemberResult = {
  id: string;
  clinicId: string;
  email: string;
  role: TeamMemberRole;
  expiresAt: string;
  // Only ever present in this one response — never stored anywhere,
  // never re-fetchable later (only its hash is persisted).
  rawToken: string;
};

// "Platform → Clínica → Equipo: gestión transversal por Superadmin".
// Calls provision_clinic_team_member() (20260916180000) — a SEPARATE RPC
// from provision_first_clinic_admin_invitation(), never that one: this
// covers ongoing team management for any of the three real roles, with
// none of that RPC's "first admin bootstrap" guards. Also separate from
// inviteClinicMember()'s invite_clinic_member(), which stays exactly as
// today for a Clinic Admin managing her own clinic. clinic_id is an
// explicit parameter (a Superadmin has no membership of her own to
// derive it from), and every field is required — every Platform
// invitation, regardless of role, carries complete pre-provisioned
// identity so a genuinely new user gets the same password-only,
// no-Confirm-Signup activation as the first Clinic Admin.
export async function provisionClinicTeamMember(
  input: ProvisionClinicTeamMemberInput,
): Promise<ProvisionClinicTeamMemberResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("provision_clinic_team_member", {
    p_clinic_id: input.clinicId,
    p_role: input.role,
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim(),
    p_email: input.email.trim(),
    p_phone: input.phone.trim(),
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return { id: row.id, clinicId: row.clinic_id, email: row.email, role: row.role, expiresAt: row.expires_at, rawToken: row.raw_token };
}

// Mirrors friendlyProvisionAdminError()'s own shape/tone, scoped to this
// RPC's own distinct rejection cases — including the two duplicate-
// membership outcomes that need different recovery actions (reactivate
// vs. nothing to do).
export function friendlyProvisionTeamMemberError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    if (message.includes("session")) {
      return "Tu sesión expiró. Recarga la página e inicia sesión de nuevo para continuar.";
    }
    if (message.includes("superadmin")) {
      return "No tienes permisos de Superadmin para agregar miembros a esta clínica.";
    }
    if (message.includes("clinic not found")) {
      return "No encontramos esta clínica. Recarga la página e intenta de nuevo.";
    }
    if (message.includes("role must be")) {
      return "Selecciona un rol válido.";
    }
    if (message.includes("already an active member")) {
      return "Esta persona ya es miembro activo de esta clínica.";
    }
    if (message.includes("already has an inactive membership")) {
      return "Esta persona ya tiene una membresía inactiva en esta clínica. Usa \"Reactivar\" en vez de crear una invitación.";
    }
    if (message.includes("already a pending invitation")) {
      return "Ya existe una invitación pendiente para este correo en esta clínica.";
    }
    if (message.includes("first_name must not be empty")) {
      return "Ingresa el nombre.";
    }
    if (message.includes("last_name must not be empty")) {
      return "Ingresa el apellido.";
    }
    if (message.includes("phone must not be empty")) {
      return "Ingresa el teléfono.";
    }
    if (message.includes("valid email")) {
      return "Ingresa un correo electrónico válido.";
    }
  }
  return "No pudimos crear la invitación. Intenta de nuevo en unos minutos.";
}
