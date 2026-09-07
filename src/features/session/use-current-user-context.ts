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
// DISPLAY, never for authorization. Returns null while loading or if
// resolution fails; callers fall back to the mock identity in that case.
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

export function useCurrentUserContext(): ClinicContext | null {
  const [context, setContext] = useState<ClinicContext | null>(null);

  useEffect(() => {
    let cancelled = false;

    resolveOnce()
      .then((result) => {
        if (!cancelled) setContext(result);
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return context;
}
