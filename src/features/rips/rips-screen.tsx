"use client";

import { useEffect, useState } from "react";
import { AlertTriangleIcon, CheckCircleIcon, ChevronDownIcon, DownloadIcon } from "@/components/shell/icons";
import { useToast } from "@/components/toast";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import {
  generateRipsSinFacturaExportAction,
  getRipsExportHistoryAction,
  getRipsPeriodSummaryAction,
  type RipsExportHistoryEntry,
  type RipsPeriodSummary,
} from "./export-actions";
import type { RipsExportPeriod } from "./export-datetime";
import { RipsExportHistoryList } from "./export-history-list";
import type { RipsReadinessError, RipsReadinessScope } from "./export-readiness";
import { RecordRipsResultModal } from "./record-rips-result-modal";

// RIPS #5 — the first real RIPS screen (Admin Clínica only, see this
// task's own Section 36 and the route's page.tsx server-side gate).
// Deliberately simple: period selector, a small set of summary numbers,
// a grouped/actionable list of pendientes, and one CTA that either stays
// disabled (blockers exist) or generates + downloads the JSON. Never a
// manual JSON editor, never the full JSON dumped on screen by default
// (this task's own Sections 25/27).

const SCOPE_LABELS: Record<RipsReadinessScope, string> = {
  clinic: "Clínica",
  location: "Sede",
  patient: "Pacientes",
  professional: "Profesionales",
  encounter: "Atenciones",
  service: "Servicios",
};

function currentPeriod(): RipsExportPeriod {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function periodToInputValue(period: RipsExportPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

function inputValueToPeriod(value: string): RipsExportPeriod | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function groupErrorsByScope(errors: RipsReadinessError[]): { scope: RipsReadinessScope; errors: RipsReadinessError[] }[] {
  const order: RipsReadinessScope[] = ["clinic", "location", "patient", "professional", "encounter", "service"];
  return order
    .map((scope) => ({ scope, errors: errors.filter((e) => e.scope === scope) }))
    .filter((group) => group.errors.length > 0);
}

export function RipsScreen() {
  const { showToast } = useToast();
  const [period, setPeriod] = useState<RipsExportPeriod>(currentPeriod);
  const [summary, setSummary] = useState<RipsPeriodSummary | null>(null);
  // Starts true — the mount effect's own fetch below is what resolves it,
  // and (per react-hooks/set-state-in-effect) nothing may call setState
  // synchronously before that effect's first `await`, so the initial
  // "loading" state is expressed here, never via a setLoading(true) at
  // the top of the effect body.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPending, setShowPending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [justGenerated, setJustGenerated] = useState(false);
  const [history, setHistory] = useState<RipsExportHistoryEntry[]>([]);
  const [recordingEntry, setRecordingEntry] = useState<RipsExportHistoryEntry | null>(null);

  const refreshHistory = async () => {
    const result = await getRipsExportHistoryAction();
    if (result.status === "ok") setHistory(result.entries);
  };

  const applySummaryResult = (result: Awaited<ReturnType<typeof getRipsPeriodSummaryAction>>) => {
    setLoading(false);
    if (result.status === "error") {
      setLoadError(result.message);
      setSummary(null);
      return;
    }
    setLoadError(null);
    setSummary(result.summary);
    setShowPending(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [summaryResult, historyResult] = await Promise.all([getRipsPeriodSummaryAction(period), getRipsExportHistoryAction()]);
      if (cancelled) return;
      applySummaryResult(summaryResult);
      if (historyResult.status === "ok") setHistory(historyResult.entries);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePeriodChange = async (value: string) => {
    const next = inputValueToPeriod(value);
    if (!next) return;
    setPeriod(next);
    setLoading(true);
    setGenerateError(null);
    setJustGenerated(false);
    const result = await getRipsPeriodSummaryAction(next);
    applySummaryResult(result);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setJustGenerated(false);
    const result = await generateRipsSinFacturaExportAction(period);
    setGenerating(false);
    if (result.status === "error") {
      setGenerateError(result.message);
      if (result.readiness) setSummary((prev) => (prev ? { ...prev, readiness: result.readiness! } : prev));
      return;
    }

    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("RIPS generado y descargado.");
    setJustGenerated(true);
    refreshHistory();
  };

  const readiness = summary?.readiness ?? null;
  const errorGroups = readiness ? groupErrorsByScope(readiness.errors) : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <section className="rounded-xl border border-border bg-background p-4 sm:p-5">
        <label className="text-[11px] text-label-foreground" htmlFor="rips-period">
          Período
        </label>
        <input
          id="rips-period"
          type="month"
          value={periodToInputValue(period)}
          onChange={(e) => handlePeriodChange(e.target.value)}
          className={`${FIELD_CLASS} mt-1 max-w-xs`}
        />
      </section>

      {loading && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Cargando período…</p>
      )}

      {loadError && (
        <div className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">{loadError}</div>
      )}

      {!loading && summary && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Atenciones encontradas" value={summary.encounterCount} />
            <SummaryCard label="Pacientes" value={summary.patientCount} />
            <SummaryCard label="Consultas" value={summary.consultationCount} />
            <SummaryCard label="Procedimientos" value={summary.procedureCount} />
          </section>

          <section className="rounded-xl border border-border bg-background p-4 sm:p-5">
            {readiness?.ready ? (
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CheckCircleIcon className="size-5 shrink-0" />
                Listo para generar
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangleIcon className="size-5 shrink-0" />
                  {readiness?.errors.length ?? 0} pendiente(s) por corregir
                </div>
                <button
                  type="button"
                  onClick={() => setShowPending((v) => !v)}
                  className="flex w-fit items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground"
                >
                  <ChevronDownIcon className={`size-3.5 transition-transform ${showPending ? "rotate-180" : ""}`} />
                  {showPending ? "Ocultar pendientes" : "Ver pendientes"}
                </button>
                {showPending && (
                  <div className="flex flex-col gap-4 border-t border-border pt-3">
                    {errorGroups.map((group) => (
                      <div key={group.scope}>
                        <p className="text-[11px] font-semibold tracking-wide text-label-foreground uppercase">{SCOPE_LABELS[group.scope]}</p>
                        <ul className="mt-1.5 flex flex-col gap-1.5">
                          {group.errors.map((error, index) => (
                            <li key={`${error.code}-${index}`} className="flex items-start justify-between gap-2 text-sm text-foreground/80">
                              <span>{error.message}</span>
                              {error.fixHref && (
                                <a href={error.fixHref} className="shrink-0 text-xs font-medium text-primary hover:underline">
                                  Corregir
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {generateError && <div className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">{generateError}</div>}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!readiness?.ready || generating || summary.encounterCount === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <DownloadIcon className="size-4" />
              {generating ? "Generando…" : "Generar RIPS"}
            </button>
          </div>

          {justGenerated && (
            <div className="rounded-lg border border-border bg-foreground/[0.03] px-3.5 py-3 text-sm text-foreground/80">
              El archivo está listo para ser cargado manualmente en el MUV. Este archivo fue generado y validado internamente por Odentia. Debe
              cargarse en el Mecanismo Único de Validación (MUV) mediante tu proceso habitual — la validación definitiva corresponde al Ministerio
              de Salud.
            </div>
          )}
        </>
      )}

      {/* Clinic-wide, independent of the currently selected period — stays visible even if that period's own summary failed to load. */}
      <section className="rounded-xl border border-border bg-background p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold">Historial de archivos</p>
        <RipsExportHistoryList entries={history} onRecordResult={setRecordingEntry} />
      </section>

      {recordingEntry && (
        <RecordRipsResultModal
          entry={recordingEntry}
          onClose={() => setRecordingEntry(null)}
          onRecorded={() => {
            setRecordingEntry(null);
            showToast("Resultado del MUV registrado.");
            refreshHistory();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3.5">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
