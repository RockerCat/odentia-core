"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveClinicContext } from "./resolve-clinic-context";
import type { ClinicContext } from "./types";

// Real display identity for the authenticated app shell (see
// components/shell/use-shell-identity.ts) — re-resolved on mount rather
// than cached, so a clinic rename/logo change shows up on the next
// navigation instead of a stale copy. src/lib/supabase/proxy.ts has
// already gated the route by the time this runs — this hook is purely for
// DISPLAY, never for authorization. Never falls back to any mock identity:
// callers show a skeleton while loading and a neutral state on failure.
//
// Header, MobileHeader, and each page's own greeting (PatientsGreeting,
// Greeting's real-shell equivalents, etc.) all mount this hook
// independently on the very same page, right after the already
// network-heavy post-login navigation (proxy.ts's gate + the destination
// Server Component both already call resolveClinicContext once each).
// Without dedup that's 2-3 more identical resolveClinicContext chains
// fired concurrently for the exact same query, which measurably adds to
// how long "Iniciando sesión…" stays on screen on a slow connection.
// resolveOnce() coalesces concurrent mounts into a single in-flight
// request; it's not a cache (cleared as soon as the request settles), so a
// later, separate navigation still re-resolves fresh, same as before.
let inFlight: Promise<ClinicContext> | null = null;

function resolveOnce(): Promise<ClinicContext> {
  if (!inFlight) {
    const supabase = createClient();
    inFlight = resolveClinicContext(supabase).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

// `enabled` (default true) lets a caller that only sometimes needs this —
// the public landing header, gated on a prop, see landing-header.tsx —
// skip the resolution entirely without breaking the rules of hooks (the
// hook itself is always called; only the effect's work is conditional).
// Every existing caller passes no argument and is unaffected.
//
// Distinguishes "still loading" from "failed" — the shell chrome needs
// that to show a skeleton vs. a neutral state, never mock data in either
// case (see use-shell-identity.ts).
export type CurrentUserContextResult =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; context: ClinicContext };

export function useCurrentUserContextResult(enabled = true): CurrentUserContextResult {
  const [result, setResult] = useState<CurrentUserContextResult>({ state: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    resolveOnce()
      .then((context) => {
        if (!cancelled) setResult({ state: "ready", context });
      })
      .catch(() => {
        if (!cancelled) setResult({ state: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return result;
}

// Same as before for its existing callers: the resolved context, or null
// while loading or if resolution failed.
export function useCurrentUserContext(enabled = true): ClinicContext | null {
  const result = useCurrentUserContextResult(enabled);
  return result.state === "ready" ? result.context : null;
}
