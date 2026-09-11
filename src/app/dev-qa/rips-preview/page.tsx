"use client";

// Dev-only QA fixture — renders RipsScreen directly, bypassing AppShell's
// route guard (same convention as clinical-encounter-preview/page.tsx).
// RipsScreen's own server actions (getRipsPeriodSummaryAction/
// generateRipsSinFacturaExportAction) still hit the real backend and
// resolve the REAL clinic context — with no real Supabase session here,
// they correctly return "No pudimos verificar tu sesión", which is enough
// to observe the period selector, the loading state, and the
// error-recovery path without crashing. 404s outside development.
//
// RIPS #5B — below the live screen, a second section renders the three
// export-history states this task introduced (generated/accepted/
// rejected) from hand-built mock RipsExportHistoryEntry rows — no
// Supabase call, no PII, using the SAME RipsExportHistoryList/
// RipsExportStatusBadge components the real screen renders (this task's
// own Section 22 "sin conexión externa. Sin PII real").
import { notFound } from "next/navigation";
import type { RipsExportHistoryEntry } from "@/features/rips/export-actions";
import { RipsExportHistoryList } from "@/features/rips/export-history-list";
import { RipsScreen } from "@/features/rips/rips-screen";

const MOCK_HISTORY_ENTRIES: RipsExportHistoryEntry[] = [
  {
    id: "mock-generated",
    period: { year: 2026, month: 7 },
    periodLabel: "julio de 2026",
    generatedAt: "2026-07-11T19:32:00.000Z",
    patientCount: 2,
    consultationCount: 3,
    procedureCount: 1,
    contentHash: "a".repeat(64),
    resultStatus: "generated",
    muvProcesoId: null,
    muvCuv: null,
    muvRadicacionAt: null,
    muvResultNotes: null,
    resultRecordedAt: null,
  },
  {
    id: "mock-accepted",
    period: { year: 2026, month: 6 },
    periodLabel: "junio de 2026",
    generatedAt: "2026-06-30T15:10:00.000Z",
    patientCount: 4,
    consultationCount: 5,
    procedureCount: 2,
    contentHash: "b".repeat(64),
    resultStatus: "accepted",
    muvProcesoId: "13",
    muvCuv: "8efeb92704b7e297c5655d4f8db683f79013967481a156c007f9b6b44a152c078670ca44415735c220dd6102a52c0fdb",
    muvRadicacionAt: "2026-07-01T00:00:00.000Z",
    muvResultNotes: null,
    resultRecordedAt: "2026-07-02T13:00:00.000Z",
  },
  {
    id: "mock-rejected",
    period: { year: 2026, month: 5 },
    periodLabel: "mayo de 2026",
    generatedAt: "2026-05-31T18:05:00.000Z",
    patientCount: 3,
    consultationCount: 3,
    procedureCount: 0,
    contentHash: "c".repeat(64),
    resultStatus: "rejected",
    muvProcesoId: null,
    muvCuv: null,
    muvRadicacionAt: null,
    muvResultNotes: "RVC059: código CUPS inconsistente con la finalidad reportada en dos consultas.",
    resultRecordedAt: "2026-06-01T09:00:00.000Z",
  },
];

export default function RipsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <RipsScreen />

      <section className="rounded-xl border border-dashed border-border bg-background p-4 sm:p-5">
        <p className="mb-1 text-xs font-semibold tracking-wide text-label-foreground uppercase">Fixture — estados de historial (dev-qa only)</p>
        <p className="mb-3 text-xs text-muted-foreground">Datos ficticios, sin conexión a Supabase ni al MUV.</p>
        <RipsExportHistoryList entries={MOCK_HISTORY_ENTRIES} onRecordResult={() => {}} />
      </section>
    </div>
  );
}
