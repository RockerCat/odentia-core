import { describe, expect, it } from "vitest";
import { decideInvitationSessionView, hasPreProvisionedIdentity } from "./team-actions";

// Regression coverage for "PROMPT NINJA — Checkpoint 1B: invitación
// consciente de usuario existente" — the exact branch that broke: a valid
// invitation to an email that already has a real Odentia account still
// showed the "Crea tu cuenta" form. This is the pure decision behind
// /invitacion/[token]'s own session-vs-invitation UI branch, extracted so
// it's testable without a DOM/mocked Supabase client.
describe("decideInvitationSessionView", () => {
  it("no session, invited email already has an Odentia account → existing-user (never the activation view)", () => {
    expect(decideInvitationSessionView(null, "alexsosa.me@gmail.com", true)).toBe("existing-user");
  });

  it("no session, invited email is genuinely new → need-auth (password-only activation, unchanged)", () => {
    expect(decideInvitationSessionView(null, "new-dentist@example.com", false)).toBe("need-auth");
  });

  it("session with the exact invited email → ready", () => {
    expect(decideInvitationSessionView("dentist@example.com", "dentist@example.com", false)).toBe("ready");
  });

  it("session with the invited email, case-insensitive → ready", () => {
    expect(decideInvitationSessionView("Dentist@Example.com", "dentist@example.com", true)).toBe("ready");
  });

  it("session with a different email → wrong-session, regardless of userExists", () => {
    expect(decideInvitationSessionView("someone-else@example.com", "dentist@example.com", false)).toBe("wrong-session");
    expect(decideInvitationSessionView("someone-else@example.com", "dentist@example.com", true)).toBe("wrong-session");
  });
});

// Regression coverage for "Platform → Clínica → Equipo: gestión
// transversal por Superadmin", extended by "Unify clinic team invitation
// activation" and "Odentia — eliminar invitaciones legacy de prueba y
// retirar Confirm Signup" (both 2026-09-21) — the exact branch that
// decides between the password-only activation view and the fail-closed
// dead end (see team-actions.ts's own updated comment: the traditional
// AccountStep/signUpAccount() path this used to fall back to was removed
// entirely once it reached zero real callers). Generalized from
// clinic_admin-only to all three roles, and no longer gated on who issued
// the invitation either — a brand-new Clinic-Admin-issued invitation now
// activates by password only, same as a Superadmin-issued one. The "no
// identity at all" case below stays a defensive check even though the
// last 7 legacy rows missing it were revoked (migration 20260921150000) —
// provision_first_clinic_admin_invitation()/provision_clinic_team_member()/
// invite_clinic_member() all enforce completeness server-side, but the UI
// must not assume it blindly.
describe("hasPreProvisionedIdentity", () => {
  const complete = { firstName: "Ana", lastName: "Admin", phone: "+57 300 1234567" };

  it("a complete, pre-provisioned clinic_admin invitation → password-only", () => {
    expect(hasPreProvisionedIdentity(complete)).toBe(true);
  });

  it("a complete, pre-provisioned dentist invitation (Platform-issued) → password-only", () => {
    expect(hasPreProvisionedIdentity({ firstName: "Luis", lastName: "Dentista", phone: "+57 300 1111111" })).toBe(true);
  });

  it("a complete, pre-provisioned assistant invitation (Platform-issued) → password-only", () => {
    expect(hasPreProvisionedIdentity({ firstName: "Sofía", lastName: "Asistente", phone: "+57 300 2222222" })).toBe(true);
  });

  it("a complete, pre-provisioned dentist invitation (Clinic-Admin-issued, invite_clinic_member()) → password-only, same function regardless of who issued it", () => {
    expect(hasPreProvisionedIdentity({ firstName: "Camila", lastName: "Odontóloga", phone: "+57 300 3333333" })).toBe(true);
  });

  it("no identity at all → fail-closed dead end, never password-only (should be structurally impossible now, checked defensively)", () => {
    expect(hasPreProvisionedIdentity({ firstName: null, lastName: null, phone: null })).toBe(false);
  });

  it("missing phone → falls back to the fail-closed dead end, defensively", () => {
    expect(hasPreProvisionedIdentity({ ...complete, phone: null })).toBe(false);
  });

  it("missing first_name → falls back to the fail-closed dead end, defensively", () => {
    expect(hasPreProvisionedIdentity({ ...complete, firstName: null })).toBe(false);
  });
});
