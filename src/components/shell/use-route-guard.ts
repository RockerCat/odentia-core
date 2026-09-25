"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { DEFAULT_ROLE, homeRouteForRole, type Role } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import { readSession, subscribeToSession } from "@/features/auth/session";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { resolvePatientContext } from "@/features/session/resolve-patient-context";
import { bridgeAuthenticatedContext } from "@/features/session/role-bridge";
import { createClient } from "@/lib/supabase/client";

const noSessionOnServer = () => false;
const getServerRole = (): Role => DEFAULT_ROLE;
const getClientRole = (): Role => readSession()?.role ?? DEFAULT_ROLE;

// The canonical useSyncExternalStore-based "have we hydrated yet" read —
// deliberately NOT a useState+useEffect("setHydrated(true)") pair (that
// pattern is a lint error here, react-hooks/set-state-in-effect: a
// setState called synchronously in an effect body). `true`/`false` are
// static — nothing ever changes after mount — so a no-op subscribe is
// correct here, unlike hasSession/role below, which really do need to
// react to a later session change.
const noopSubscribe = () => () => {};
const getServerHydrated = () => false;
const getClientHydrated = () => true;

// Pure so the actual regression (see useRouteGuard's own comment) is
// provable without mounting/hydrating a component — see
// use-route-guard.test.ts. `hydrated` gates the decision entirely: a
// pre-hydration render's `sessionOk`/`roleOk` are provisional (the server
// has no access to localStorage), so nothing here may fire a redirect
// until they're known to be the real client values.
export function decideRouteGuardRedirect({
  hydrated,
  sessionOk,
  roleOk,
  role,
}: {
  hydrated: boolean;
  sessionOk: boolean;
  roleOk: boolean;
  role: Role;
}): string | null {
  if (!hydrated) return null;
  if (!sessionOk) return "/login";
  if (!roleOk) return homeRouteForRole(role);
  return null;
}

// Whether the self-heal effect below should (re-)bridge the real context.
// Deliberately keyed on WHO the cached bridge session belongs to, never on
// merely "does a cached session exist" (see this file's own comment on the
// real production bug that gap caused — role-bridge.ts's session cache is
// a single global localStorage key, never scoped per real Supabase user).
//
// - No stored session at all, or a legacy one written before authUserId
//   existed (`storedAuthUserId` falsy either way) → always self-heal.
// - A stored session tied to a DIFFERENT real auth user than the one
//   currently signed in → self-heal (this is the exact stale-cache bug:
//   a prior account's bridged role otherwise sticks around forever).
// - A stored session tied to the SAME real auth user → trust it, no-op.
//
// `currentAuthUserId` is a cheap, local-only read (see the effect below)
// — never treated as authorization here or anywhere downstream; it exists
// purely to detect a stale client cache. Extracted as a pure function for
// the same reason decideRouteGuardRedirect is: see this function's own
// regression tests.
export function shouldRunSelfHeal(
  hydrated: boolean,
  storedAuthUserId: string | null | undefined,
  currentAuthUserId: string | null,
): boolean {
  if (!hydrated) return false;
  if (!storedAuthUserId) return true;
  return storedAuthUserId !== currentAuthUserId;
}

// Whether the redirect decision below may run yet. Mirrors
// shouldRunSelfHeal's own `hasSession` (never `sessionOk`) gating: the
// redirect decision must wait for self-heal to have a real chance to run
// and complete — in EVERY environment, not just production — before ever
// concluding a role is wrong. See this function's own regression test.
export function resolveEffectiveHydrated(hydrated: boolean, hasSession: boolean, checkedRealSession: boolean): boolean {
  return hydrated && (hasSession || checkedRealSession);
}

// Shared by every shell (AppShell for the clinic dashboard, PortalShell for
// the Patient portal) so the same hydration-safe session/role check isn't
// duplicated per shell. Returns whether the current page may render.
export function useRouteGuard(allowedRoles?: Role[]): boolean {
  const router = useRouter();

  // Real bug, found investigating a real production report: a genuinely
  // logged-in Clinic Admin's very first HARD navigation to /agenda (typing
  // the URL, a hard refresh, a new tab — anything that actually hydrates,
  // as opposed to an in-app <Link> click) rendered a totally blank page
  // with no shell, nav, or error at all.
  //
  // Root cause — confirmed by reproducing useSyncExternalStore's own
  // hydration behavior in isolation, not assumed: the server (and the
  // client's OWN first, hydration-matching render, by React's own
  // contract for this hook) has no access to localStorage, so hasSession
  // below is provisionally `false` on that first render even when the
  // real bridged session already exists — React itself self-corrects to
  // the true value one render later (same "one-tick flash" trade-off
  // getClientRole's own comment already documents for `role`), but the
  // OLD code fired the actual `router.replace("/login")` side effect
  // straight off that first, still-provisional render — confirmed via a
  // standalone SSR+hydrateRoot repro: the effect observes `sessionOk:
  // false` and calls router.replace("/login") BEFORE the corrected
  // re-render ever happens. For an already-authenticated user this sends
  // a real session bouncing toward /login, which src/lib/supabase/
  // proxy.ts immediately redirects back out of (it sees a valid real
  // Supabase session) — racing against React's own correction and, on a
  // real browser, leaving AppShell rendering `null` (this file's `if
  // (!authorized) return null`) through some or all of that bounce.
  //
  // Fix: gate the REDIRECT DECISION (not the render output — that one
  // harmless "one-tick flash" of `authorized: false` is unavoidable and
  // fine) on having actually hydrated. `hydrated` flips true in the same
  // commit/effect pass as useSyncExternalStore's own correction — the
  // same repro confirms the effect never observes a stale `sessionOk:
  // false` once gated this way, so a real, already-logged-in session
  // never gets bounced toward /login at all.
  const hydrated = useSyncExternalStore(noopSubscribe, getClientHydrated, getServerHydrated);

  // subscribeToSession (not a no-op) so a session change elsewhere in the
  // same tab — e.g. "Salir" clearing it — is reflected here too, exactly
  // like `role` below already is.
  const hasSession = useSyncExternalStore(subscribeToSession, () => readSession() !== null, noSessionOnServer);
  // In production, only a /login demo session unlocks the app. In
  // development this mock-session check is skipped (the real gate is
  // proxy.ts either way) — see src/dev/role.ts.
  const sessionOk = process.env.NODE_ENV === "development" || hasSession;

  // Hydration-safe the same way role-context.tsx's own role read is: the
  // server always "sees" DEFAULT_ROLE (no localStorage access), matching
  // the client's first render, so this never causes a mismatch.
  const role = useSyncExternalStore(subscribeToSession, getClientRole, getServerRole);
  // Unlike sessionOk above, this is NOT bypassed in development — the dev
  // role switcher must still kick you out of a role-gated page (e.g. a
  // Patient switched to Odontólogo while on /portal, or vice versa) the
  // moment the role stops being one of allowedRoles.
  const roleOk = !allowedRoles || allowedRoles.includes(role);

  const authorized = sessionOk && roleOk;

  // Real bug, found running an actual signup→onboarding→/agenda pass
  // against production: the mock session bridge (bridgeAuthenticatedContext,
  // src/features/session/role-bridge.ts) is ONLY ever written from
  // /login's own form submit — but a genuinely authenticated user who
  // never submits that form (landing on /agenda straight from onboarding,
  // whose own real session was established via /auth/confirm; a bookmark;
  // browser back/forward) has NO mock session at all, not just a stale
  // one. Trying /login itself doesn't help either: src/lib/supabase/
  // proxy.ts redirects away from it server-side before the form ever
  // renders, since a valid real Supabase session already exists — so the
  // bridge-writing code never runs, and hasSession stays permanently
  // false. Confirmed live: a real post-onboarding session showed a real
  // Supabase auth cookie but `localStorage["odentia:session"] === null`,
  // and no amount of refreshing fixed it (this is NOT the transient
  // one-tick hydration flash `hydrated` above already handles — it's a
  // real, permanent absence of data).
  //
  // Self-heal: once hydrated, re-resolve the real context exactly the same
  // way /login itself does and (re-)bridge it before ever concluding a
  // redirect — either because there's no cached bridge session at all, or
  // because the one that's cached belongs to a DIFFERENT real user than
  // whoever is actually signed in right now (see shouldRunSelfHeal's own
  // comment). hasSession above is subscribed to subscribeToSession, so
  // writeSession (inside bridgeAuthenticatedContext) triggers a normal
  // re-render with the corrected value once this resolves.
  // `checkedRealSession` only exists to keep the REDIRECT decision from
  // firing while this check is still in flight (a real network round
  // trip) — it's only ever set from inside the async callback, never
  // synchronously in the effect body.
  //
  // REGRESSION #1 (found via "Prompt Master — Corregir invitación/acceso
  // de Patient": a real Patient landing on /portal/citas immediately after
  // activating a brand-new Portal invitation — no /login, no DEV role
  // switcher — looped /portal/citas -> /agenda -> /portal ->
  // /portal/citas forever in development): this used to gate on
  // `sessionOk`, not `hasSession`. `sessionOk` is unconditionally true in
  // development (see its own comment), so in dev this effect never ran at
  // all for a genuinely new real session with no mock role bridged yet —
  // `role` stayed DEFAULT_ROLE ("clinic-admin"), roleOk was false for
  // ["patient"], and the guard redirected to /agenda before self-heal ever
  // got a chance to resolve the real "patient" role. Gating on `hasSession`
  // instead fixes this in every environment while leaving the DEV role
  // switcher untouched: writeSession() (called by the switcher, same as by
  // this self-heal) makes hasSession true immediately.
  //
  // REGRESSION #2 (real production report, "Prompt Master — Odentia:
  // auditoría post-piloto"): gating solely on `hasSession` meant this
  // effect only ever ran while the cache was completely EMPTY — once
  // written for ANY real user, it stayed "trusted" forever, even for a
  // DIFFERENT real user who later authenticates in the same browser (e.g.
  // an earlier invitation/login test, then a brand-new admin activating
  // her own invitation via /invitacion/[token], which never itself wrote a
  // bridge — see that page's own comment). The new admin silently
  // inherited whatever role was last cached for the earlier account, with
  // no automatic correction short of an explicit logout + real /login
  // submit. Fix: read the cached session's own `authUserId` (see
  // session.ts) and compare it against the REAL currently-signed-in user
  // (a cheap, LOCAL-only `auth.getSession()` read — never used for
  // authorization, only to detect a stale cache) before trusting it.
  const [checkedRealSession, setCheckedRealSession] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // Local-only, no network round trip in the common case — purely for
      // the staleness comparison below, never as an authorization check
      // (resolveClinicContext/resolvePatientContext below still use the
      // real, server-validated auth.getUser() for that).
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      const currentAuthUserId = authSession?.user.id ?? null;
      const storedAuthUserId = readSession()?.authUserId;
      if (!shouldRunSelfHeal(hydrated, storedAuthUserId, currentAuthUserId)) {
        setCheckedRealSession(true);
        return;
      }
      const [clinicContext, patientContext] = await Promise.all([
        resolveClinicContext(supabase),
        resolvePatientContext(supabase),
      ]);
      if (cancelled) return;
      bridgeAuthenticatedContext(clinicContext, patientContext);
      setCheckedRealSession(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, hasSession]);

  const effectiveHydrated = resolveEffectiveHydrated(hydrated, hasSession, checkedRealSession);

  useEffect(() => {
    const redirectTo = decideRouteGuardRedirect({ hydrated: effectiveHydrated, sessionOk, roleOk, role });
    if (redirectTo) router.replace(redirectTo);
  }, [effectiveHydrated, sessionOk, roleOk, role, router]);

  return authorized;
}
