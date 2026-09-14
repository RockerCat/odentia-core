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

export async function inviteClinicMember(email: string, role: "dentist" | "assistant"): Promise<InviteMemberOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("invite_clinic_member", { p_email: email, p_role: role });

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
