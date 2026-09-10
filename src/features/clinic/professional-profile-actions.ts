import { createClient } from "@/lib/supabase/client";
import type { TeamMember } from "./data";

// The one sanctioned write path — always through
// update_my_professional_profile() (see the migration), never a direct
// table UPDATE: professional_profiles has no RLS UPDATE policy at all,
// deliberately (see the foundation RLS migration's own comment). The RPC
// resolves the caller's OWN professional_profile from auth.uid() alone —
// this wrapper never sends a profile id, clinic_membership_id, or clinic_id
// of any kind, and never assumes the UI's own "am I allowed to see this
// button" check is the real enforcement.

export type UpdateProfessionalProfileInput = {
  specialtyId: string | null;
  licenseNumber: string;
  defaultAppointmentDurationMinutes: number | null;
  bio: string;
  // RIPS #3 — same official TipoDocumento catalog as patient identity
  // (rips_reference_values, catalog_key = 'TipoDocumento'). Both empty or
  // both filled, enforced by the RPC (see its migration).
  documentType: string | null;
  documentNumber: string;
};

export type UpdateProfessionalProfileOutcome =
  | { status: "ok"; professionalProfile: NonNullable<TeamMember["professionalProfile"]> }
  | { status: "error"; message: string };

export async function updateMyProfessionalProfile(
  input: UpdateProfessionalProfileInput,
  specialtyNameById: Map<string, string>,
): Promise<UpdateProfessionalProfileOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("update_my_professional_profile", {
    p_primary_specialty_id: input.specialtyId,
    p_license_number: input.licenseNumber,
    p_default_appointment_duration_minutes: input.defaultAppointmentDurationMinutes,
    p_bio: input.bio,
    p_document_type: input.documentType,
    p_document_number: input.documentNumber,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para editar este perfil profesional." };
    }
    if (error.message.includes("no professional profile found")) {
      return { status: "error", message: "No encontramos tu perfil profesional en esta clínica." };
    }
    if (error.message.includes("specialty")) {
      return { status: "error", message: "Selecciona una especialidad válida." };
    }
    if (error.message.includes("duration")) {
      return { status: "error", message: "La duración de cita debe ser un número de minutos positivo." };
    }
    if (error.message.includes("document_type and document_number")) {
      return { status: "error", message: "Completa tipo y número de documento, o deja ambos vacíos." };
    }
    if (error.message.includes("TipoDocumento")) {
      return { status: "error", message: "Selecciona un tipo de documento válido." };
    }
    return { status: "error", message: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    status: "ok",
    professionalProfile: {
      id: row.id,
      active: row.active,
      licenseNumber: row.license_number,
      specialtyId: row.primary_specialty_id,
      specialtyName: row.primary_specialty_id ? (specialtyNameById.get(row.primary_specialty_id) ?? null) : null,
      defaultAppointmentDurationMinutes: row.default_appointment_duration_minutes,
      bio: row.bio,
      documentType: row.document_type,
      documentNumber: row.document_number,
    },
  };
}

// "¿También atiendes pacientes?" → create_my_professional_profile() (see
// that migration) — the real counterpart to bootstrap_clinic's own
// is_dentist flag, offered again later for a Clinic Admin who said "no" at
// signup. Same "never sends an id of any kind" shape as
// updateMyProfessionalProfile above; the RPC resolves the caller's own
// active clinic_admin membership entirely from auth.uid() and rejects
// outright if one already exists (see the migration's own errcode 23505
// path) or if the caller isn't clinic_admin (errcode 42501) — this
// wrapper never assumes the "no perfil aún" UI state it's called from is
// itself the real guard.
export type CreateProfessionalProfileInput = UpdateProfessionalProfileInput;
export type CreateProfessionalProfileOutcome = UpdateProfessionalProfileOutcome;

export async function createMyProfessionalProfile(
  input: CreateProfessionalProfileInput,
  specialtyNameById: Map<string, string>,
): Promise<CreateProfessionalProfileOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_my_professional_profile", {
    p_primary_specialty_id: input.specialtyId,
    p_license_number: input.licenseNumber,
    p_default_appointment_duration_minutes: input.defaultAppointmentDurationMinutes,
    p_bio: input.bio,
    p_document_type: input.documentType,
    p_document_number: input.documentNumber,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "Solo un administrador de clínica puede configurar un perfil profesional propio." };
    }
    if (error.code === "23505" || error.message.includes("already exists")) {
      return { status: "error", message: "Ya tienes un perfil profesional configurado." };
    }
    if (error.message.includes("no active clinic_admin membership")) {
      return { status: "error", message: "No encontramos una membresía activa de administrador para tu cuenta." };
    }
    if (error.message.includes("specialty")) {
      return { status: "error", message: "Selecciona una especialidad válida." };
    }
    if (error.message.includes("duration")) {
      return { status: "error", message: "La duración de cita debe ser un número de minutos positivo." };
    }
    if (error.message.includes("document_type and document_number")) {
      return { status: "error", message: "Completa tipo y número de documento, o deja ambos vacíos." };
    }
    if (error.message.includes("TipoDocumento")) {
      return { status: "error", message: "Selecciona un tipo de documento válido." };
    }
    return { status: "error", message: "No pudimos crear tu perfil profesional. Intenta de nuevo." };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    status: "ok",
    professionalProfile: {
      id: row.id,
      active: row.active,
      licenseNumber: row.license_number,
      specialtyId: row.primary_specialty_id,
      specialtyName: row.primary_specialty_id ? (specialtyNameById.get(row.primary_specialty_id) ?? null) : null,
      defaultAppointmentDurationMinutes: row.default_appointment_duration_minutes,
      bio: row.bio,
      documentType: row.document_type,
      documentNumber: row.document_number,
    },
  };
}
