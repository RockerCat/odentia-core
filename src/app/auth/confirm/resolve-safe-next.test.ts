import { describe, expect, it } from "vitest";
import { resolveSafeNext } from "./resolve-safe-next";

// Regression coverage for "PROMPT NINJA — Fix Supabase Auth email
// RedirectTo / Confirm Signup": proves route.ts's own `next` resolution
// correctly recovers a same-origin absolute URL (the shape Supabase's
// `.RedirectTo` template variable produces once the Confirm Signup
// template embeds it as `next={{ .RedirectTo }}`), keeps accepting the
// already-relative shape requestPasswordReset() still sends, and never
// follows a different-origin URL.

const ORIGIN = "https://odentia.co";

describe("resolveSafeNext", () => {
  it("passes through an already-relative path unchanged (requestPasswordReset's own shape)", () => {
    expect(resolveSafeNext("/registro", ORIGIN)).toBe("/registro");
    expect(resolveSafeNext("/reset-password", ORIGIN)).toBe("/reset-password");
  });

  it("extracts the relative path from a same-origin absolute URL — normal signup", () => {
    expect(resolveSafeNext("https://odentia.co/registro", ORIGIN)).toBe("/registro");
  });

  it("extracts a nested path from a same-origin absolute URL — team invitation signup", () => {
    expect(resolveSafeNext("https://odentia.co/invitacion/abc123", ORIGIN)).toBe("/invitacion/abc123");
  });

  it("extracts a nested path from a same-origin absolute URL — patient portal invitation signup", () => {
    expect(resolveSafeNext("https://odentia.co/portal/invitacion/xyz789", ORIGIN)).toBe("/portal/invitacion/xyz789");
  });

  it("preserves a query string on a same-origin absolute URL, if one is ever present", () => {
    expect(resolveSafeNext("https://odentia.co/registro?foo=bar", ORIGIN)).toBe("/registro?foo=bar");
  });

  it("never follows a different-origin absolute URL — falls back to /registro (open-redirect protection)", () => {
    expect(resolveSafeNext("https://evil.example.com/phish", ORIGIN)).toBe("/registro");
  });

  it("falls back to /registro for a value that's neither relative nor a valid absolute URL", () => {
    expect(resolveSafeNext("not a url", ORIGIN)).toBe("/registro");
  });

  it("falls back to /registro when next is missing entirely", () => {
    expect(resolveSafeNext(null, ORIGIN)).toBe("/registro");
  });

  it("falls back to /registro for a bare origin with no path — the exact failure mode reported: .RedirectTo collapsing to {{ .SiteURL }} when the Redirect URLs allow-list rejects the real destination", () => {
    expect(resolveSafeNext("https://odentia.co", ORIGIN)).toBe("/registro");
  });

  it("falls back to /registro for a literal relative \"/\" — never redirects to the landing page as a \"confirmation destination\"", () => {
    expect(resolveSafeNext("/", ORIGIN)).toBe("/registro");
  });
});
