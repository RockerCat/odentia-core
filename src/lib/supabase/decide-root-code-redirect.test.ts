import { describe, expect, it } from "vitest";
import { decideRootCodeRedirect } from "./proxy";

// Regression coverage for the "/?code=..." PKCE fallback (see proxy.ts's
// own comment): Supabase's default hosted email template doesn't thread
// emailRedirectTo through for a PKCE-flow signup, so the confirmation link
// lands the browser on "/" with the real code appended instead of
// "/auth/confirm". This is the pure decision proxy.ts's updateSession()
// applies to every request to "/" — tested here without mocking
// NextRequest/Supabase at all.

describe("decideRootCodeRedirect", () => {
  it('"/?code=test-code" redirects to "/auth/confirm?code=test-code&next=/registro"', () => {
    expect(decideRootCodeRedirect("test-code")).toBe("/auth/confirm?code=test-code&next=/registro");
  });

  it('a bare "/" (no code) never redirects — the landing page renders normally', () => {
    expect(decideRootCodeRedirect(null)).toBeNull();
  });

  it("an empty code query param (?code=) is treated the same as no code at all", () => {
    expect(decideRootCodeRedirect("")).toBeNull();
  });

  it("URL-encodes the code — never builds an open redirect from it", () => {
    // A PKCE code is never expected to contain URL-special characters, but
    // this proves the value is actually encoded (not string-concatenated
    // raw) rather than assuming it from the implementation.
    expect(decideRootCodeRedirect("a b&next=/evil")).toBe(
      "/auth/confirm?code=a%20b%26next%3D%2Fevil&next=/registro",
    );
  });

  it("`next` is always the literal /registro — never derived from any input", () => {
    // decideRootCodeRedirect takes no `next`/redirect parameter at all —
    // there is nothing for a caller to inject even if it wanted to.
    expect(decideRootCodeRedirect("x")).toContain("&next=/registro");
  });
});
