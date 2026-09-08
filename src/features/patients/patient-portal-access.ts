import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Staff → "Dar acceso al Portal" — the missing half of the Patient Portal
// access flow. Everything else already existed and is reused unmodified:
// patient_access_invitations, accept_patient_access_invitation(),
// /portal/invitacion/[token], real signup/login, patient_user_links,
// resolvePatientContext(). This file is only the staff-facing EMISSION
// side: check whether a patient already has portal access
// (fetchPatientPortalLinkStatus, a plain SELECT under the existing
// patient_user_links_select_staff RLS policy — clinic_admin/assistant of
// that patient's own clinic, same two roles the invitation RPC itself
// authorizes) and create a real invitation (createPatientPortalInvitation,
// wrapping create_patient_access_invitation()).

export type PatientPortalLinkStatus = { linked: boolean };

// A plain read, not an RPC: patient_user_links_select_staff (foundation
// RLS) already scopes this to exactly what the caller may see — no new
// policy needed, no new relation exposed beyond "does a link row exist
// for this patient" (this never reads profile_id — which real account is
// linked isn't shown or needed here).
export async function fetchPatientPortalLinkStatus(
  supabase: SupabaseClient,
  patientId: string,
): Promise<PatientPortalLinkStatus> {
  const { data, error } = await supabase
    .from("patient_user_links")
    .select("id")
    .eq("patient_id", patientId)
    .maybeSingle();
  if (error) throw error;
  return { linked: data !== null };
}

const GENERIC_ERROR = "No pudimos generar la invitación. Intenta de nuevo.";

export type CreatePatientPortalInvitationOutcome =
  | { status: "ok"; link: string; expiresAt: string }
  | { status: "error"; message: string }
  // A distinct outcome, not just an "error" — the UI reacts to this by
  // switching straight to the "Acceso al Portal activo" state instead of
  // showing a dismissible error banner (see PatientPortalAccessCard).
  | { status: "already-linked" };

// Wraps create_patient_access_invitation() (see that migration): resolves
// clinic_id/auth.uid() and re-checks authorization entirely server-side —
// this client wrapper never sends a clinic_id and never assumes the UI's
// own role gate (canEditPatientData) is the real boundary. A pending,
// unexpired invitation for this patient is silently superseded by the RPC
// itself (token_hash-only storage means the previous raw token is
// unrecoverable — there is nothing to "resend"), so this always returns a
// fresh, valid link on success, never a stale ref to the same one.
export async function createPatientPortalInvitation(patientId: string): Promise<CreatePatientPortalInvitationOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_patient_access_invitation", { p_patient_id: patientId });

  if (error) {
    if (error.message.includes("already linked")) {
      return { status: "already-linked" };
    }
    if (error.code === "42501") {
      return { status: "error", message: "No tienes permiso para dar acceso al portal a este paciente." };
    }
    if (error.message.includes("inactive patient")) {
      return { status: "error", message: "No se puede invitar a un paciente inactivo." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    status: "ok",
    link: `${window.location.origin}/portal/invitacion/${row.raw_token}`,
    expiresAt: row.expires_at,
  };
}
