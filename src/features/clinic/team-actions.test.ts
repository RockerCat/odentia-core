import { describe, expect, it } from "vitest";
import { decideInvitationSessionView, hasPreProvisionedIdentity } from "./team-actions";

// Regression coverage for "PROMPT NINJA — Checkpoint 1B: invitación
// consciente de usuario existente" — the exact branch that broke: a valid
// invitation to an email that already has a real Odentia account still
// showed the "Crea tu cuenta" form. This is the pure decision behind
// /invitacion/[token]'s own session-vs-invitation UI branch, extracted so
// it's testable without a DOM/mocked Supabase client.
describe("decideInvitationSessionView", () => {
  it("no session, invited email already has an Odentia account → existing-user (never AccountStep)", () => {
    expect(decideInvitationSessionView(null, "alexsosa.me@gmail.com", true)).toBe("existing-user");
  });

  it("no session, invited email is genuinely new → need-auth (AccountStep, unchanged)", () => {
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

// Regression coverage for "Provisioning Checkpoint 3 — Activación
// password-only del primer Clinic Admin nuevo" — the exact branch that
// decides between the password-only activation view and the traditional
// AccountStep. Must never activate for a traditional dentist/assistant
// invitation, and must never activate for an incomplete clinic_admin
// invitation (defensive — provision_first_clinic_admin_invitation()
// already enforces completeness server-side, but the UI must not assume
// it blindly).
describe("hasPreProvisionedIdentity", () => {
  const complete = { role: "clinic_admin" as const, firstName: "Ana", lastName: "Admin", phone: "+57 300 1234567" };

  it("a complete, pre-provisioned clinic_admin invitation → password-only", () => {
    expect(hasPreProvisionedIdentity(complete)).toBe(true);
  });

  it("a traditional dentist invitation (no pre-provisioned identity) → AccountStep, never password-only", () => {
    expect(hasPreProvisionedIdentity({ role: "dentist", firstName: null, lastName: null, phone: null })).toBe(false);
  });

  it("a traditional assistant invitation → AccountStep, never password-only", () => {
    expect(hasPreProvisionedIdentity({ role: "assistant", firstName: null, lastName: null, phone: null })).toBe(false);
  });

  it("clinic_admin role but missing phone → falls back to AccountStep, defensively", () => {
    expect(hasPreProvisionedIdentity({ ...complete, phone: null })).toBe(false);
  });

  it("clinic_admin role but missing first_name → falls back to AccountStep, defensively", () => {
    expect(hasPreProvisionedIdentity({ ...complete, firstName: null })).toBe(false);
  });

  it("null role (not-found/invalid preview) → never password-only", () => {
    expect(hasPreProvisionedIdentity({ role: null, firstName: "Ana", lastName: "Admin", phone: "123" })).toBe(false);
  });
});
