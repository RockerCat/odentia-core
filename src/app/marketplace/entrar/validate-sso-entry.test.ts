import { describe, expect, it } from "vitest";
import { canonicalCallbackUrl, isCanonicalCallback, isValidState } from "./validate-sso-entry";

// Regression coverage for "PROMPT NINJA SSO E — Core authenticated entry
// point": redirect_uri validation is the one open-redirect-critical piece
// of route.ts — proves it accepts only Marketplace's own exact canonical
// callback and rejects every variant that would turn this into an open
// redirect (different host, subdomain, path, protocol, query/fragment,
// protocol-relative, javascript:/data:).

const MARKETPLACE_URL = "https://marketplace.odentia.com";
const CANONICAL = "https://marketplace.odentia.com/auth/sso/callback";

describe("isValidState", () => {
  it("accepts a reasonable opaque token", () => {
    expect(isValidState("a1b2c3d4e5f6")).toBe(true);
  });

  it("rejects null/empty", () => {
    expect(isValidState(null)).toBe(false);
    expect(isValidState("")).toBe(false);
  });

  it("rejects an absurdly long value", () => {
    expect(isValidState("a".repeat(513))).toBe(false);
    expect(isValidState("a".repeat(512))).toBe(true);
  });

  it("rejects control/newline characters", () => {
    expect(isValidState("abc\ndef")).toBe(false);
    expect(isValidState("abc\x00def")).toBe(false);
  });
});

describe("canonicalCallbackUrl", () => {
  it("builds the fixed canonical callback from MARKETPLACE_URL", () => {
    expect(canonicalCallbackUrl(MARKETPLACE_URL).toString()).toBe(CANONICAL);
  });

  it("throws on an invalid MARKETPLACE_URL", () => {
    expect(() => canonicalCallbackUrl("not-a-url")).toThrow();
  });
});

describe("isCanonicalCallback", () => {
  it("accepts the exact canonical callback", () => {
    expect(isCanonicalCallback(CANONICAL, MARKETPLACE_URL)).toBe(true);
  });

  it("rejects null/empty", () => {
    expect(isCanonicalCallback(null, MARKETPLACE_URL)).toBe(false);
    expect(isCanonicalCallback("", MARKETPLACE_URL)).toBe(false);
  });

  it("rejects a different host entirely", () => {
    expect(isCanonicalCallback("https://evil.com/auth/sso/callback", MARKETPLACE_URL)).toBe(false);
  });

  it("rejects an arbitrary subdomain", () => {
    expect(isCanonicalCallback("https://evil.marketplace.odentia.com/auth/sso/callback", MARKETPLACE_URL)).toBe(false);
  });

  it("rejects a different path", () => {
    expect(isCanonicalCallback("https://marketplace.odentia.com/auth/sso/callback-evil", MARKETPLACE_URL)).toBe(false);
    expect(isCanonicalCallback("https://marketplace.odentia.com/", MARKETPLACE_URL)).toBe(false);
  });

  it("rejects a different protocol", () => {
    expect(isCanonicalCallback("http://marketplace.odentia.com/auth/sso/callback", MARKETPLACE_URL)).toBe(false);
  });

  it("rejects a different port", () => {
    expect(isCanonicalCallback("https://marketplace.odentia.com:8443/auth/sso/callback", MARKETPLACE_URL)).toBe(false);
  });

  it("rejects extra query string or fragment", () => {
    expect(isCanonicalCallback(`${CANONICAL}?extra=1`, MARKETPLACE_URL)).toBe(false);
    expect(isCanonicalCallback(`${CANONICAL}#frag`, MARKETPLACE_URL)).toBe(false);
  });

  it("rejects protocol-relative and non-http(s) schemes", () => {
    expect(isCanonicalCallback("//marketplace.odentia.com/auth/sso/callback", MARKETPLACE_URL)).toBe(false);
    expect(isCanonicalCallback("javascript:alert(1)", MARKETPLACE_URL)).toBe(false);
    expect(isCanonicalCallback("data:text/html,<script>alert(1)</script>", MARKETPLACE_URL)).toBe(false);
  });

  it("rejects a bare relative path", () => {
    expect(isCanonicalCallback("/auth/sso/callback", MARKETPLACE_URL)).toBe(false);
  });

  it("rejects an absurdly long redirect_uri", () => {
    const huge = `${CANONICAL}?${"a".repeat(2048)}`;
    expect(isCanonicalCallback(huge, MARKETPLACE_URL)).toBe(false);
  });
});
