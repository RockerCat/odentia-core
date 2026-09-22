"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// "Platform → Clínica → Equipo: gestión transversal por Superadmin",
// generalized again by "Unify clinic team invitation activation"
// (2026-09-21) — reached by ANY invitation carrying complete
// pre-provisioned identity, regardless of who issued it: a Superadmin
// (`provision_first_clinic_admin_invitation()`, 20260916150000;
// `provision_clinic_team_member()`, 20260916180000) or, since this same
// checkpoint, a Clinic Admin's own "Agregar miembro"
// (`invite_clinic_member()`, migration 20260921140000, which now requires
// first_name/last_name/phone too) — never a general "create an account"
// endpoint. The person's access already started from a real, secret,
// cryptographic token whoever issued it generated and handed to her
// directly; the Confirm Signup email loop (designed for an ANONYMOUS
// public signup, where the email address itself is the only proof of
// ownership) adds no real security here and was actively breaking the
// happy path — see this task's own smoke report.
//
// Same rule the password-only UI branch already enforces client-side
// (hasPreProvisionedIdentity(), src/features/clinic/team-actions.ts) —
// restated here rather than a cross-file import, since this is the
// server-side re-validation of that same invariant, never a value trusted
// from the browser.
const MIN_PASSWORD_LENGTH = 8;

export type ActivatePreProvisionedInvitationOutcome =
  | { status: "ok"; email: string }
  // Deliberately the SAME shape the client's existing "existing-user" view
  // already renders — this covers both "the account already existed
  // before this submission" and "it was created moments ago in a race
  // between preview and this call": either way the safe, correct next
  // step is the same normal login, never touching that account.
  | { status: "existing-user"; email: string }
  | { status: "error"; message: string };

// Server-only re-resolution of the invitation — NEVER trusts the
// browser's own preview object for email/first_name/last_name/phone/
// role/user_exists. Calls the SAME anon-callable preview_clinic_invitation()
// RPC (20260916160000) the page's own initial preview already uses, just
// from the server instead of the browser: that function is granted to
// `anon` (see its own migration), so this plain, unauthenticated-capable
// server client resolves it correctly with NO new grant/RPC/migration —
// deliberately NOT the service-role admin client for this step, since
// this project's own service_role-table-grant incident (see
// 20260910100000's header comment) already demonstrated that
// `service_role` has NO implicit access to a table/function it was never
// explicitly granted, and preview_clinic_invitation was only ever granted
// to anon/authenticated. Admin API access below is reserved exclusively
// for the one operation that genuinely requires it: auth.admin.createUser
// — a GoTrue Admin endpoint authorized directly by the service-role key
// itself, entirely independent of Postgres GRANT/RLS, so it needs no
// table/function grant at all.
export async function activatePreProvisionedInvitationAction(
  token: string,
  password: string,
): Promise<ActivatePreProvisionedInvitationOutcome> {
  if (typeof token !== "string" || token.trim() === "") {
    return { status: "error", message: "Este enlace de invitación no es válido." };
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { status: "error", message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_clinic_invitation", { p_token: token });

  if (error) {
    console.error("[activatePreProvisionedInvitationAction] preview_clinic_invitation failed", {
      code: error.code,
      message: error.message,
    });
    return { status: "error", message: "No pudimos validar esta invitación. Intenta de nuevo." };
  }

  const row = Array.isArray(data) ? data[0] : data;

  // usable is only ever true for status === "pending" AND not-yet-expired
  // (preview_clinic_invitation()'s own v_effective_status logic) — the
  // exact same condition the page's own initial preview already gates on,
  // recomputed fresh here rather than trusting whatever the browser saw
  // moments ago.
  if (!row || !row.usable) {
    return { status: "error", message: "Este enlace de invitación no es válido." };
  }

  // Defensive, not the primary gate: the password-only form is only ever
  // rendered client-side when hasPreProvisionedIdentity() is already true
  // for this exact same preview shape — this just refuses to activate an
  // incomplete invitation (should be structurally impossible now that
  // every issuing RPC requires these — see this file's own header — but
  // never trusted blindly here) or a genuinely historical Clinic-Admin
  // invitation created before this checkpoint. Deliberately role-agnostic
  // (no `row.role` check): every issuing RPC (`invite_clinic_member()`/
  // `provision_clinic_team_member()`/`provision_first_clinic_admin_invitation()`)
  // carries this complete identity for clinic_admin, dentist, AND
  // assistant alike — role determines membership/professional_profile
  // effects entirely inside accept_clinic_invitation(), never here.
  if (!row.first_name || !row.last_name || !row.email || !row.phone) {
    return { status: "error", message: "Esta invitación no admite activación por contraseña." };
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
    // profiles.first_name/last_name. Never role/clinic_id/platform role/
    // membership/permissions: those are never Auth metadata anywhere in
    // this codebase, and authorization still starts only at
    // accept_clinic_invitation() — this call creates an Auth identity,
    // nothing more.
    user_metadata: {
      first_name: row.first_name,
      last_name: row.last_name,
    },
  });

  if (createError) {
    // Race: preview said user_exists === false, but the account was
    // created (by a retry, a concurrent tab, or genuinely someone else)
    // between that read and this call. Treated identically to the
    // already-existing case above — never a generic 500, never any
    // attempt to touch that account.
    if (createError.code === "email_exists" || /already registered|already exists/i.test(createError.message)) {
      return { status: "existing-user", email: row.email };
    }
    if (createError.code === "weak_password" || /password/i.test(createError.message)) {
      return { status: "error", message: "La contraseña no cumple los requisitos de seguridad. Intenta con otra." };
    }
    console.error("[activatePreProvisionedInvitationAction] admin.createUser failed", {
      code: createError.code,
      message: createError.message,
    });
    return { status: "error", message: "No pudimos activar tu cuenta. Intenta de nuevo en unos minutos." };
  }

  return { status: "ok", email: row.email };
}
