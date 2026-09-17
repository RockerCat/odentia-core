import { describe, expect, it } from "vitest";
import { decideRouteGuardRedirect, resolveEffectiveHydrated, shouldRunSelfHeal } from "./use-route-guard";

// Regression coverage for a real production report: a freshly onboarded
// Clinic Admin's first HARD navigation to /agenda (as opposed to an in-app
// <Link> click) rendered a totally blank page — no shell, nav, or error.
//
// Root cause (reproduced in isolation with a standalone SSR+hydrateRoot
// harness, not assumed): useRouteGuard's session/role reads use
// useSyncExternalStore, whose contract requires the client's FIRST
// (hydration-matching) render to reuse the server's snapshot — no
// localStorage access there — even for an already-logged-in user whose
// real bridged session already exists. React self-corrects to the true
// value one render later, but the OLD code fired router.replace("/login")
// straight off that first, still-provisional `sessionOk: false` — sending
// a genuinely valid session bouncing toward /login (which
// src/lib/supabase/proxy.ts immediately redirects back out of), racing
// React's own correction and leaving AppShell rendering `null`.
//
// decideRouteGuardRedirect is the pure decision this hook's effect now
// applies — gating on `hydrated` is what prevents the premature redirect.
// This file proves that decision in isolation; the hook itself (and its
// actual hydration timing) isn't re-verified here — see the standalone
// repro used to establish the root cause for that.

describe("decideRouteGuardRedirect", () => {
  it("REGRESSION: never redirects before hydration, even with the provisional sessionOk:false an already-logged-in user's first render shows", () => {
    expect(decideRouteGuardRedirect({ hydrated: false, sessionOk: false, roleOk: true, role: "clinic-admin" })).toBeNull();
  });

  it("never redirects before hydration for any combination — the server/first-render snapshot is never trusted for a redirect decision", () => {
    expect(decideRouteGuardRedirect({ hydrated: false, sessionOk: true, roleOk: false, role: "patient" })).toBeNull();
  });

  it("once hydrated, redirects to /login when there's genuinely no session", () => {
    expect(decideRouteGuardRedirect({ hydrated: true, sessionOk: false, roleOk: true, role: "clinic-admin" })).toBe("/login");
  });

  it("once hydrated, redirects to the role's own home route when the role isn't allowed on this page", () => {
    expect(decideRouteGuardRedirect({ hydrated: true, sessionOk: true, roleOk: false, role: "patient" })).toBe("/portal/citas");
  });

  it("once hydrated with a valid session and an allowed role, never redirects — the fresh Clinic Admin's actual /agenda case", () => {
    expect(decideRouteGuardRedirect({ hydrated: true, sessionOk: true, roleOk: true, role: "clinic-admin" })).toBeNull();
  });
});

// Regression coverage for "Prompt Master — Corregir invitación/acceso de
// Patient reutilizando el patrón de Team Invitations" (smoke follow-up): a
// real Patient landing on /portal/citas immediately after a brand-new
// Portal invitation activation — no /login, no DEV role switcher —
// looped /portal/citas -> /agenda -> /portal -> /portal/citas forever in
// development.
//
// Root cause: the self-heal effect (useRouteGuard's own comment on the
// production-onboarding bug it was built for) used to gate on `sessionOk`,
// which is unconditionally true in development (`NODE_ENV === "development"
// || hasSession`) purely so the DEV role switcher works without a real
// login. That meant in development the self-heal never ran at all for a
// genuinely new real session with no mock role bridged yet — `role` stayed
// DEFAULT_ROLE ("clinic-admin"), failing PortalShell's ["patient"] check
// and bouncing to /agenda, which itself bounces a linked-but-unmembershipped
// Patient to /portal, which redirects back to /portal/citas. shouldRunSelfHeal/
// resolveEffectiveHydrated are the two pure decisions that used to read
// `sessionOk` and now correctly read the REAL `hasSession` instead — proven
// here without mounting the hook or mocking Supabase/useSyncExternalStore.
describe("shouldRunSelfHeal", () => {
  it("REGRESSION: must run even when sessionOk would be dev-bypassed to true — hasSession (never sessionOk) gates this", () => {
    expect(shouldRunSelfHeal(true, false)).toBe(true);
  });

  it("never runs before hydration", () => {
    expect(shouldRunSelfHeal(false, false)).toBe(false);
  });

  it("never re-runs once a real mock session already exists (a DEV role-switcher pick, or an already-completed bridge)", () => {
    expect(shouldRunSelfHeal(true, true)).toBe(false);
  });
});

describe("resolveEffectiveHydrated", () => {
  it("REGRESSION: not effectively hydrated until self-heal has run, even in development (no session yet, self-heal not done)", () => {
    expect(resolveEffectiveHydrated(true, false, false)).toBe(false);
  });

  it("becomes effectively hydrated once self-heal completes, session bridged or not", () => {
    expect(resolveEffectiveHydrated(true, false, true)).toBe(true);
  });

  it("is immediately effectively hydrated when a real mock session already exists — nothing to wait for", () => {
    expect(resolveEffectiveHydrated(true, true, false)).toBe(true);
  });

  it("never effectively hydrated before real hydration, regardless of session/self-heal state", () => {
    expect(resolveEffectiveHydrated(false, true, true)).toBe(false);
  });
});
