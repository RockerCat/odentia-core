import { createClient } from "@/lib/supabase/client";
import type { TeamMemberRole, TeamMemberStatus } from "./data";

// The one sanctioned write path for each operation — always through
// invite_clinic_member()/accept_clinic_invitation()/set_clinic_member_status()
// (see the team-invitation-rpcs migration), never a direct table INSERT/
// UPDATE: clinic_memberships/professional_profiles/clinic_invitations all
// have no RLS policy for those commands at all, deliberately (see the
// foundation RLS migration's own comments). Each RPC resolves clinic_id/
// auth.uid() itself server-side and re-checks authorization — this client
// wrapper never sends clinic_id, and never assumes the UI's own role check
// is sufficient on its own.

const GENERIC_ERROR = "No pudimos completar la acción. Intenta de nuevo.";

export type InvitationRecord = {
  id: string;
  clinicId: string;
  email: string;
  role: TeamMemberRole;
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: string;
  // Only ever present in the response of invite_clinic_member() itself —
  // never stored anywhere, never re-fetchable later (only its hash is
  // persisted). This is the one moment the admin can copy/share it.
  rawToken: string;
};

export type InviteMemberOutcome = { status: "ok"; invitation: InvitationRecord } | { status: "error"; message: string };

export type InviteClinicMemberInput = {
  email: string;
  role: "dentist" | "assistant";
  firstName: string;
  lastName: string;
  phone: string;
};

// "Unify clinic team invitation activation" — invite_clinic_member() now
// requires complete pre-provisioned identity (first_name/last_name/phone),
// same fields/validation provision_clinic_team_member() already enforces
// (src/features/platform/api.ts), so a Clinic-Admin-issued invitation
// activates by password only (activatePreProvisionedInvitationAction()),
// never auth.signUp()/Confirm Signup. Signature change (migration
// 20260921140000, DROP + CREATE) — the old 2-arg, identity-less overload
// no longer exists at all.
export async function inviteClinicMember(input: InviteClinicMemberInput): Promise<InviteMemberOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("invite_clinic_member", {
    p_email: input.email,
    p_role: input.role,
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim(),
    p_phone: input.phone.trim(),
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "Solo un administrador activo puede invitar miembros." };
    }
    if (error.message.includes("already an active member")) {
      return { status: "error", message: "Esta persona ya es miembro activo de tu clínica." };
    }
    if (error.message.includes("already a pending invitation") || error.message.includes("pending invitation")) {
      return { status: "error", message: "Ya existe una invitación pendiente para este correo." };
    }
    if (error.message.includes("valid email")) {
      return { status: "error", message: "Ingresa un correo electrónico válido." };
    }
    // Same three messages friendlyProvisionTeamMemberError() already uses
    // for provision_clinic_team_member()'s identical validation — kept in
    // sync deliberately, never re-worded independently.
    if (error.message.includes("first_name must not be empty")) {
      return { status: "error", message: "Ingresa el nombre." };
    }
    if (error.message.includes("last_name must not be empty")) {
      return { status: "error", message: "Ingresa el apellido." };
    }
    if (error.message.includes("phone must not be empty")) {
      return { status: "error", message: "Ingresa el teléfono." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    status: "ok",
    invitation: {
      id: row.id,
      clinicId: row.clinic_id,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAt: row.expires_at,
      rawToken: row.raw_token,
    },
  };
}

export type SetMemberStatusOutcome =
  | { status: "ok"; memberStatus: TeamMemberStatus }
  | { status: "error"; message: string };

export async function setClinicMemberStatus(membershipId: string, active: boolean): Promise<SetMemberStatusOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("set_clinic_member_status", {
    p_membership_id: membershipId,
    p_active: active,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "Solo un administrador activo puede cambiar el estado de un miembro." };
    }
    if (error.message.includes("last active admin")) {
      return { status: "error", message: "No puedes desactivar al único administrador activo de la clínica." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { status: "ok", memberStatus: row.status };
}

export type RegenerateInvitationOutcome =
  | { status: "ok"; invitation: InvitationRecord }
  | { status: "error"; message: string };

// Gives a still-pending invitation a fresh token/link — the only way to
// recover a lost/expired one, since the raw token itself was never stored.
// The raw token is returned only at regeneration time and is not persisted.
export async function regenerateClinicInvitation(
  invitationId: string,
): Promise<RegenerateInvitationOutcome> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("regenerate_clinic_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    if (error.code === "42501") {
      return {
        status: "error",
        message: "Solo un administrador activo de esta clínica puede regenerar este enlace.",
      };
    }

    if (error.message.includes("invitation not found")) {
      return { status: "error", message: "No encontramos esa invitación." };
    }

    if (error.message.includes("only a pending invitation")) {
      return {
        status: "error",
        message: "Solo se pueden regenerar invitaciones pendientes.",
      };
    }

    return { status: "error", message: GENERIC_ERROR };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    status: "ok",
    invitation: {
      id: row.id,
      clinicId: row.clinic_id,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAt: row.expires_at,
      rawToken: row.raw_token,
    },
  };
}

export type AcceptInvitationOutcome =
  | { status: "ok"; clinicId: string; role: TeamMemberRole }
  | { status: "error"; message: string };

export async function acceptClinicInvitation(token: string): Promise<AcceptInvitationOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("accept_clinic_invitation", { p_token: token });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "Esta invitación fue enviada a otro correo electrónico." };
    }
    if (error.message.includes("already accepted")) {
      return { status: "error", message: "Esta invitación ya fue aceptada." };
    }
    if (error.message.includes("revoked")) {
      return { status: "error", message: "Esta invitación fue revocada." };
    }
    if (error.message.includes("expired")) {
      return { status: "error", message: "Esta invitación ya venció. Pide a tu administrador que te envíe una nueva." };
    }
    if (error.message.includes("not valid")) {
      return { status: "error", message: "Este enlace de invitación no es válido." };
    }
    if (error.message.includes("already have a membership")) {
      return { status: "error", message: "Ya tienes una membresía en esta clínica." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { status: "ok", clinicId: row.clinic_id, role: row.role };
}

// Real, pre-auth invitation validation (PROMPT NINJA "Checkpoint 1 —
// reparar infraestructura común de invitaciones") — lets /invitacion/
// [token] fail fast on an invalid/expired/accepted/revoked token instead
// of only discovering that at the very end of a full signup + email
// confirmation round trip. `usable` is only ever true for `status ===
// "pending"` (see preview_clinic_invitation()'s own comment) — never
// treat any other status as safe to proceed past. A transport/RPC error
// here is deliberately mapped to the SAME shape as "not found" — this
// must fail closed, never render as if the token were valid.
export type InvitationPreview = {
  status: "pending" | "expired" | "accepted" | "revoked" | "not-found";
  usable: boolean;
  email: string | null;
  role: TeamMemberRole | null;
  clinicName: string | null;
  // Checkpoint 1B — whether the invited email already has a real Odentia
  // account (public.profiles, resolved server-side inside the RPC off
  // the token's own invited email — never a client-supplied email; see
  // that migration's own comment). Only ever meaningful when `usable` is
  // true; never used to render anything on its own.
  userExists: boolean;
  // Checkpoint 3 — pre-provisioned identity for a Superadmin-issued first
  // Clinic Admin invitation (see provision_first_clinic_admin_invitation(),
  // 20260916150000). Always null for a traditional dentist/assistant
  // invitation (invite_clinic_member() never sets these columns) — the
  // page's own password-only branch only activates when all three are
  // present, never on role/userExists alone.
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

const NOT_FOUND_PREVIEW: InvitationPreview = {
  status: "not-found",
  usable: false,
  email: null,
  role: null,
  clinicName: null,
  userExists: false,
  firstName: null,
  lastName: null,
  phone: null,
};

export async function previewClinicInvitation(token: string): Promise<InvitationPreview> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("preview_clinic_invitation", { p_token: token });

  if (error) return NOT_FOUND_PREVIEW;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.status === null) return NOT_FOUND_PREVIEW;

  return {
    status: row.status,
    usable: row.usable,
    email: row.email,
    role: row.role,
    clinicName: row.clinic_name,
    userExists: row.user_exists,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
  };
}

// The exact branch behind /invitacion/[token]'s own session-vs-invitation
// decision, extracted so it's independently testable without a
// DOM/mocked Supabase client — same "pure decide-where-to-go function"
// convention this codebase already uses for decideClinicRedirect/
// decideAuthenticatedRedirect. Only ever called once a preview has
// already confirmed `usable`, so `invitedEmail`/`userExists` are always
// the real, server-resolved values for THIS token, never a client guess.
export type InvitationSessionView = "need-auth" | "existing-user" | "ready" | "wrong-session";

export function decideInvitationSessionView(
  authedEmail: string | null,
  invitedEmail: string,
  userExists: boolean,
): InvitationSessionView {
  if (!authedEmail) return userExists ? "existing-user" : "need-auth";
  return authedEmail.toLowerCase() === invitedEmail.toLowerCase() ? "ready" : "wrong-session";
}

// Checkpoint 3 — the exact branch behind /invitacion/[token]'s
// password-only vs. traditional AccountStep decision, extracted for the
// same independent-testability reason as decideInvitationSessionView
// above. Only ever meaningful for a brand-new email (the "need-auth"
// session view) — an existing-user/ready/wrong-session flow never
// touches signup at all, so this is never consulted there.
//
// Generalized (Platform → Clínica → Equipo checkpoint) to ALL THREE
// roles — deliberately NOT gated on role === "clinic_admin", and (since
// "Unify clinic team invitation activation", 2026-09-21) not gated on WHO
// issued the invitation either: every issuing RPC — Superadmin
// (provision_first_clinic_admin_invitation()/provision_clinic_team_member())
// or Clinic Admin (invite_clinic_member(), migration 20260921140000) —
// now requires complete pre-provisioned identity. The identity-
// completeness check alone is a safe, structural way to route a brand-new
// invitation (never a heuristic): those three columns are only ever
// non-null together. Only a genuinely historical Clinic-Admin invitation
// created BEFORE this checkpoint can still have all three null, in which
// case this correctly falls back to the traditional AccountStep path.
export function hasPreProvisionedIdentity(preview: {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}): boolean {
  return preview.firstName !== null && preview.lastName !== null && preview.phone !== null;
}
