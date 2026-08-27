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
export function useCurrentUserContext(): ClinicContext | null {
  const [context, setContext] = useState<ClinicContext | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const result = await resolveClinicContext(supabase);
        if (!cancelled) setContext(result);
      } catch {
        if (!cancelled) setContext(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return context;
}
