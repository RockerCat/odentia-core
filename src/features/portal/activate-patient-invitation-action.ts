"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Patient counterpart to activatePreProvisionedInvitationAction
// (src/features/clinic/activate-invitation-action.ts) — same reasoning,
// same shape: the person's access already started from a real, secret,
// cryptographic patient_access_invitations token a staff member generated
// and handed to her directly, and her identity (first_name/last_name/
// email) already exists on the Patient record. Re-running the public
// AccountStep + Confirm Signup loop here added nothing but friction and a
// re-typed identity — this bypasses it exactly the way the staff flow
// already does for a pre-provisioned invitation.
//
// Unlike the staff action, there is no "traditional invitation, never
// pre-provisioned" branch to defend against here: every patient_access_invitations
// row is created the same way (create_patient_access_invitation()) and
// always points at a real, existing Patient — this action is the ONLY
// "new account" path for Patient, never a second one alongside a generic
// signup.
const MIN_PASSWORD_LENGTH = 8;

export type ActivatePatientInvitationOutcome =
  | { status: "ok"; email: string }
  // Same shape/meaning as the staff action's own "existing-user": covers
  // both "the account already existed before this submission" and "it was
  // created moments ago in a race between preview and this call" — either
  // way the safe next step is a normal login, never touching that account.
  | { status: "existing-user"; email: string }
  | { status: "error"; message: string };

// Server-only re-resolution of the invitation — NEVER trusts the
// browser's own preview object for first_name/last_name/email/user_exists.
// Calls the SAME anon-callable preview_patient_access_invitation() RPC
// (20260917090000) the page's own initial preview already uses, just from
// the server instead of the browser — no new grant needed. Only `token`
// and the password just typed are sent to the server; patient_id/clinic_id
// are never accepted from the client at all, here or anywhere else in this
// flow — accept_patient_access_invitation() (called separately, right
// after this succeeds) is what actually resolves and claims the Patient,
// entirely from the token itself.
export async function activatePatientAccessInvitationAction(
  token: string,
  password: string,
): Promise<ActivatePatientInvitationOutcome> {
  if (typeof token !== "string" || token.trim() === "") {
    return { status: "error", message: "Este enlace de invitación no es válido." };
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { status: "error", message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_patient_access_invitation", { p_token: token });

  if (error) {
    console.error("[activatePatientAccessInvitationAction] preview_patient_access_invitation failed", {
      code: error.code,
      message: error.message,
    });
    return { status: "error", message: "No pudimos validar esta invitación. Intenta de nuevo." };
  }

  const row = Array.isArray(data) ? data[0] : data;

  // usable is only ever true for a still-pending, not-yet-expired
  // invitation — recomputed fresh here rather than trusting whatever the
  // browser saw moments ago.
  if (!row || !row.usable) {
    return { status: "error", message: "Este enlace de invitación no es válido." };
  }

  // patients.email is nullable (see that table's own migration) — a real,
  // legitimate gap, not something this action may fill in on its own. No
  // invented value, no fallback identity: fail closed with a message
  // pointing back at the one place this can actually be fixed (the Patient
  // record itself), same "fail closed on real DB state" convention this
  // codebase already uses for bootstrap-state resolution.
  if (!row.first_name || !row.last_name || !row.email) {
    return {
      status: "error",
      message:
        "Este paciente no tiene un correo registrado en el sistema. Pide en la clínica que lo agreguen para poder crear tu acceso.",
    };
  }

  if (row.user_exists) {
    return { status: "existing-user", email: row.email };
  }

  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email: row.email,
    password,
    email_confirm: true,
    // Only first_name/last_name — exactly what on_auth_user_created
    // (handle_new_user(), foundation schema) reads to populate
    // profiles.first_name/last_name. Never patient_id/clinic_id: those are
    // never Auth metadata anywhere in this codebase, and authorization to
    // claim the Patient still starts only at accept_patient_access_invitation() —
    // this call creates an Auth identity, nothing more.
    user_metadata: {
      first_name: row.first_name,
      last_name: row.last_name,
    },
  });

  if (createError) {
    // Race: preview said user_exists === false, but the account was
    // created (by a retry, a concurrent tab, or genuinely someone else
    // signing up separately with that same email) between that read and
    // this call. Treated identically to the already-existing case above —
    // never a generic 500, never any attempt to touch that account.
    if (createError.code === "email_exists" || /already registered|already exists/i.test(createError.message)) {
      return { status: "existing-user", email: row.email };
    }
    if (createError.code === "weak_password" || /password/i.test(createError.message)) {
      return { status: "error", message: "La contraseña no cumple los requisitos de seguridad. Intenta con otra." };
    }
    console.error("[activatePatientAccessInvitationAction] admin.createUser failed", {
      code: createError.code,
      message: createError.message,
    });
    return { status: "error", message: "No pudimos activar tu cuenta. Intenta de nuevo en unos minutos." };
  }

  return { status: "ok", email: row.email };
}
