import { describe, expect, it } from "vitest";
import { resolveLoginReturnTo } from "./resolve-login-return-to";

// Regression coverage for "PROMPT NINJA — Checkpoint 1: reparar
// infraestructura común de invitaciones" — the return-to used by
// /login?next=... after a real sign-in, wired up from
// /invitacion/[token] so an existing-account user returns there
// automatically instead of a manual "vuelve a abrir este enlace" note.
describe("resolveLoginReturnTo", () => {
  it("accepts a real invitation path", () => {
    expect(resolveLoginReturnTo("/invitacion/abc123")).toBe("/invitacion/abc123");
  });

  it("accepts a path with its own query string", () => {
    expect(resolveLoginReturnTo("/invitacion/abc123?x=1")).toBe("/invitacion/abc123?x=1");
  });

  it("rejects an absolute external URL", () => {
    expect(resolveLoginReturnTo("https://evil.example/phish")).toBeNull();
  });

  it("rejects a protocol-relative URL", () => {
    expect(resolveLoginReturnTo("//evil.example")).toBeNull();
  });

  it("rejects the backslash variant of a protocol-relative URL", () => {
    expect(resolveLoginReturnTo("/\\evil.example")).toBeNull();
  });

  it("rejects a bare scheme/host with no leading slash", () => {
    expect(resolveLoginReturnTo("evil.example")).toBeNull();
  });

  it("falls back to null for empty/missing input", () => {
    expect(resolveLoginReturnTo("")).toBeNull();
    expect(resolveLoginReturnTo(null)).toBeNull();
  });
});
