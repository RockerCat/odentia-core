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

// Distinguishes "still loading" from "failed" so the Portal chrome can
// show a skeleton vs. a neutral state — never mock content in either case.
export type PatientContextResult = { state: "loading" } | { state: "error" } | { state: "ready"; context: PatientContext };

export function usePatientContextResult(): PatientContextResult {
  const [result, setResult] = useState<PatientContextResult>({ state: "loading" });

  useEffect(() => {
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
  }, []);

  return result;
}

// Same as before for its existing callers: the resolved context, or null
// while loading or if resolution failed.
export function usePatientContext(): PatientContext | null {
  const result = usePatientContextResult();
  return result.state === "ready" ? result.context : null;
}
