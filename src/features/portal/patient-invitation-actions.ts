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
