import { describe, expect, it } from "vitest";
import { decidePatientInvitationSessionView } from "./patient-invitation-actions";

// Regression coverage for "Prompt Master — Corregir invitación/acceso de
// Patient reutilizando el patrón de Team Invitations" — the pure decision
// behind /portal/invitacion/[token]'s own session-vs-invitation UI branch,
// extracted the same way team-actions.test.ts already tests
// decideInvitationSessionView, without a DOM/mocked Supabase client.
//
// Deliberately no "wrong-session" case here (unlike the staff version):
// patient_access_invitations carries no target email to match a session
// against (see accept_patient_access_invitation()'s own migration
// comment — a deliberate QR/link-claim design) — whoever is authenticated
// is the one authorized to claim it.
describe("decidePatientInvitationSessionView", () => {
  it("already authenticated (any account) → ready, regardless of the Patient's own email/userExists", () => {
    expect(decidePatientInvitationSessionView(true, "paciente@example.com", false)).toBe("ready");
    expect(decidePatientInvitationSessionView(true, "paciente@example.com", true)).toBe("ready");
    expect(decidePatientInvitationSessionView(true, null, false)).toBe("ready");
  });

  it("no session, Patient has no email on file → no-email (never invents one, never re-asks for identity)", () => {
    expect(decidePatientInvitationSessionView(false, null, false)).toBe("no-email");
  });

  it("no session, Patient's own email already has an Odentia account → existing-user (never a password-only signup)", () => {
    expect(decidePatientInvitationSessionView(false, "paciente@example.com", true)).toBe("existing-user");
  });

  it("no session, Patient's own email is genuinely new → need-auth (password-only activation)", () => {
    expect(decidePatientInvitationSessionView(false, "paciente@example.com", false)).toBe("need-auth");
  });
});
