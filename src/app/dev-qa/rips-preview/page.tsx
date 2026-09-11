"use client";

// Dev-only QA fixture — renders RipsScreen directly, bypassing AppShell's
// route guard (same convention as clinical-encounter-preview/page.tsx).
// RipsScreen's own server actions (getRipsPeriodSummaryAction/
// generateRipsSinFacturaExportAction) still hit the real backend and
// resolve the REAL clinic context — with no real Supabase session here,
// they correctly return "No pudimos verificar tu sesión", which is enough
// to observe the period selector, the loading state, and the
// error-recovery path without crashing. 404s outside development.
import { notFound } from "next/navigation";
import { RipsScreen } from "@/features/rips/rips-screen";

export default function RipsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-4xl p-6">
      <RipsScreen />
    </div>
  );
}
