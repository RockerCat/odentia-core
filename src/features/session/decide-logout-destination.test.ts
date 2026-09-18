import { describe, expect, it } from "vitest";
import { isCoreProductionHostname } from "./decide-logout-destination";

// Regression coverage for "Prompt Ninja — corregir logout cross-host en
// localhost": logout from a non-production Core (localhost, a preview
// deploy) must never silently hop to the real production Marketplace/Core
// URLs — see use-shell-logout.ts's own signOut() and
// src/app/auth/logout/route.ts, the two real callers of this function.

describe("isCoreProductionHostname", () => {
  it("is true for the real apex production hostname", () => {
    expect(isCoreProductionHostname("odentia.co")).toBe(true);
  });

  it("is true for the real www production hostname", () => {
    expect(isCoreProductionHostname("www.odentia.co")).toBe(true);
  });

  it("is false for localhost — never silently federates to production", () => {
    expect(isCoreProductionHostname("localhost")).toBe(false);
  });

  it("is false for 127.0.0.1", () => {
    expect(isCoreProductionHostname("127.0.0.1")).toBe(false);
  });

  it("is false for a preview/staging deploy hostname — a build/preview may have different needs than real production", () => {
    expect(isCoreProductionHostname("odentia-core-git-feature-x.vercel.app")).toBe(false);
  });

  it("is false for the Marketplace hostname itself — never confused with Core's own", () => {
    expect(isCoreProductionHostname("marketplace.odentia.co")).toBe(false);
  });

  it("is false for a lookalike/spoofed hostname — never a substring/suffix match", () => {
    expect(isCoreProductionHostname("odentia.co.evil.example")).toBe(false);
    expect(isCoreProductionHostname("evil-odentia.co")).toBe(false);
    expect(isCoreProductionHostname("notodentia.co")).toBe(false);
  });

  it("is false for an empty hostname", () => {
    expect(isCoreProductionHostname("")).toBe(false);
  });
});
