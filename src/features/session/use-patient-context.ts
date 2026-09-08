"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolvePatientContext } from "./resolve-patient-context";
import type { PatientContext } from "./types";

// Real display identity for the Portal shell (see
// components/shell/portal-shell.tsx) — same "purely for display, never for
// authorization" contract as use-current-user-context.ts: src/lib/supabase/
// proxy.ts has already gated the route by the time this runs. Same
// concurrent-mount dedup too (Portal's desktop header + mobile header both
// mount this on every page) — coalesces into one in-flight request rather
// than firing resolvePatientContext twice for the same render.
let inFlight: Promise<PatientContext> | null = null;

function resolveOnce(): Promise<PatientContext> {
  if (!inFlight) {
    const supabase = createClient();
    inFlight = resolvePatientContext(supabase).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function usePatientContext(): PatientContext | null {
  const [context, setContext] = useState<PatientContext | null>(null);

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
