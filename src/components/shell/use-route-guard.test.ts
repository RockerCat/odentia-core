import { describe, expect, it } from "vitest";
import { decideRouteGuardRedirect } from "./use-route-guard";

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
