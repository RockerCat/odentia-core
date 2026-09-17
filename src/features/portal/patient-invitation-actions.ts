import { createClient } from "@/lib/supabase/client";

// The one sanctioned write path for consuming a patient_access_invitations
// token — always through accept_patient_access_invitation() (see that
// migration), never a direct patient_user_links INSERT: that table has no
// RLS INSERT policy for `authenticated` at all, deliberately (see the
// foundation RLS migration's own comment — a link may only ever be created
// this way, never by guessing/brute-forcing patient ids). This wrapper
// never sends a patient_id/clinic_id of any kind; the RPC resolves
// everything from the token itself and auth.uid().

const GENERIC_ERROR = "No pudimos vincular tu cuenta. Intenta de nuevo.";

export type AcceptPatientInvitationOutcome = { status: "ok"; clinicId: string } | { status: "error"; message: string };

export async function acceptPatientAccessInvitation(token: string): Promise<AcceptPatientInvitationOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("accept_patient_access_invitation", { p_token: token });

  if (error) {
    if (error.message.includes("already used")) {
      return { status: "error", message: "Este enlace de invitación ya fue usado." };
    }
    if (error.message.includes("revoked")) {
      return { status: "error", message: "Este enlace de invitación fue revocado." };
    }
    if (error.message.includes("expired")) {
      return { status: "error", message: "Este enlace de invitación ya venció. Pide a tu clínica uno nuevo." };
    }
    if (error.message.includes("not valid")) {
      return { status: "error", message: "Este enlace de invitación no es válido." };
    }
    if (error.message.includes("already linked")) {
      return { status: "error", message: "Este registro de paciente ya está vinculado a una cuenta." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { status: "ok", clinicId: row.clinic_id };
}

// Real, pre-auth invitation validation — the Patient counterpart to
// previewClinicInvitation (src/features/clinic/team-actions.ts), same
// "fail fast before offering any account action" reasoning (PROMPT NINJA
// "Checkpoint 1" there). `usable` is only ever true for status ===
// "pending" — never treat any other status as safe to proceed past. A
// transport/RPC error here is deliberately mapped to the SAME shape as
// "not found" — this must fail closed, never render as if the token were
// valid.
export type PatientInvitationPreview = {
  status: "pending" | "expired" | "used" | "revoked" | "not-found";
  usable: boolean;
  firstName: string | null;
  lastName: string | null;
  // Null when the Patient record itself has no email on file (patients.email
  // is nullable) — a real, legitimate gap, never a value to fabricate here
  // or anywhere downstream.
  email: string | null;
  clinicName: string | null;
  // Whether the Patient's own on-file email already has a real Odentia
  // account (public.profiles, resolved server-side inside the RPC off
  // patients.email — never a client-supplied email). Only ever meaningful
  // when `usable` is true and `email` is non-null.
  userExists: boolean;
};

const NOT_FOUND_PATIENT_PREVIEW: PatientInvitationPreview = {
  status: "not-found",
  usable: false,
  firstName: null,
  lastName: null,
  email: null,
  clinicName: null,
  userExists: false,
};

export async function previewPatientAccessInvitation(token: string): Promise<PatientInvitationPreview> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("preview_patient_access_invitation", { p_token: token });

  if (error) return NOT_FOUND_PATIENT_PREVIEW;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.status === null) return NOT_FOUND_PATIENT_PREVIEW;

  return {
    status: row.status,
    usable: row.usable,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    clinicName: row.clinic_name,
    userExists: row.user_exists,
  };
}

// The exact branch behind /portal/invitacion/[token]'s own session-vs-
// invitation decision, extracted so it's independently testable without a
// DOM/mocked Supabase client — same convention as team-actions.ts's own
// decideInvitationSessionView. Deliberately simpler than that one: Patient
// invitations carry no target email to match a session against (see
// accept_patient_access_invitation()'s own migration comment — a
// deliberate QR/link-claim design), so there is no "wrong-session" case
// here — whoever is authenticated when they open a usable link is the one
// authorized to claim it. The only branching that matters is: already
// authenticated (→ ready to claim), or not yet, in which case the ONLY
// thing that decides whether a brand-new account can be created here is
// whether the Patient record has an email to create it with, and whether
// that email already has an account.
export type PatientInvitationSessionView = "ready" | "no-email" | "existing-user" | "need-auth";

export function decidePatientInvitationSessionView(
  isAuthenticated: boolean,
  patientEmail: string | null,
  userExists: boolean,
): PatientInvitationSessionView {
  if (isAuthenticated) return "ready";
  if (!patientEmail) return "no-email";
  return userExists ? "existing-user" : "need-auth";
}
