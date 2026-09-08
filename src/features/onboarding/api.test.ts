import { describe, expect, it } from "vitest";
import { buildSignUpRedirectTo } from "./api";

// Regression coverage for "PROMPT NINJA — Fix Supabase Auth email
// RedirectTo / Confirm Signup": proves signUpAccount()'s own
// emailRedirectTo is built correctly for all three real signup contexts —
// the destination itself, never a "/auth/confirm?next=..." query string
// (see api.ts's own comment on why that shape broke both under Supabase's
// default template and the hand-edited one using {{ .RedirectTo }}).

const ORIGIN = "https://odentia.co";

describe("buildSignUpRedirectTo", () => {
  it("normal signup (/registro, signUpAccount's own default `next`) points directly at /registro", () => {
    expect(buildSignUpRedirectTo(ORIGIN, "/registro")).toBe("https://odentia.co/registro");
  });

  it("team invitation signup points at the exact /invitacion/[token] the link came from", () => {
    expect(buildSignUpRedirectTo(ORIGIN, "/invitacion/abc123")).toBe("https://odentia.co/invitacion/abc123");
  });

  it("patient portal invitation signup points at the exact /portal/invitacion/[token] the link came from", () => {
    expect(buildSignUpRedirectTo(ORIGIN, "/portal/invitacion/xyz789")).toBe("https://odentia.co/portal/invitacion/xyz789");
  });

  it("never builds a query string of its own — the destination IS the path, resolveSafeNext handles the rest on the receiving end", () => {
    expect(buildSignUpRedirectTo(ORIGIN, "/registro")).not.toContain("?");
    expect(buildSignUpRedirectTo(ORIGIN, "/invitacion/abc123")).not.toContain("?");
  });

  it("works with whatever origin the browser is actually on (local dev, not just production)", () => {
    expect(buildSignUpRedirectTo("http://127.0.0.1:3000", "/registro")).toBe("http://127.0.0.1:3000/registro");
  });
});
