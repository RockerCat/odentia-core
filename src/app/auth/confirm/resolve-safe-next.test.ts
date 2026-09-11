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

  it("REGRESSION: honors an explicit fallback for the Recovery flow — a real password-reset E2E run hit the exact bare-origin allow-list failure and landed on /registro's own \"already onboarded\" screen (a dead end, no password form) instead of /reset-password", () => {
    expect(resolveSafeNext("https://odentia.co", ORIGIN, "/reset-password")).toBe("/reset-password");
    expect(resolveSafeNext(null, ORIGIN, "/reset-password")).toBe("/reset-password");
  });

  it("an explicit fallback doesn't change behavior when a real destination survives", () => {
    expect(resolveSafeNext("/reset-password", ORIGIN, "/reset-password")).toBe("/reset-password");
    expect(resolveSafeNext("https://odentia.co/invitacion/abc123", ORIGIN, "/reset-password")).toBe("/invitacion/abc123");
  });

  // Regression coverage for "PROMPT NINJA — signup iniciado en localhost
  // confirma email en producción": when Site URL is production (ORIGIN
  // here), a signup started on localhost still has its email confirmed by
  // a request TO production — `origin` is always production's own, never
  // localhost's. These prove the one deliberate exception: a loopback
  // destination is trusted even though its origin differs from `origin`,
  // and — critically — returned as a FULL absolute URL so route.ts never
  // re-prepends production's own origin on top of it (the exact bug a
  // first pass at this fix introduced and this test would have caught).
  it("trusts a loopback (localhost) destination even though its origin differs from the confirm request's own", () => {
    expect(resolveSafeNext("http://localhost:3000/registro", ORIGIN)).toBe("http://localhost:3000/registro");
  });

  it("trusts a loopback (127.0.0.1) destination the same way", () => {
    expect(resolveSafeNext("http://127.0.0.1:3000/registro", ORIGIN)).toBe("http://127.0.0.1:3000/registro");
  });

  it("preserves a query string on a loopback destination", () => {
    expect(resolveSafeNext("http://localhost:3000/invitacion/abc123?foo=bar", ORIGIN)).toBe(
      "http://localhost:3000/invitacion/abc123?foo=bar",
    );
  });

  it("never trusts an https loopback URL — a real Next.js dev server is always http", () => {
    expect(resolveSafeNext("https://localhost:3000/registro", ORIGIN)).toBe("/registro");
  });

  it("never trusts a look-alike hostname — exact match only, never a substring/subdomain trick", () => {
    expect(resolveSafeNext("http://localhost.evil.example.com/phish", ORIGIN)).toBe("/registro");
    expect(resolveSafeNext("http://127.0.0.1.evil.example.com/phish", ORIGIN)).toBe("/registro");
  });
});
