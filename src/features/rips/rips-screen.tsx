"use client";

import { useEffect, useState } from "react";
import { AlertTriangleIcon, CheckCircleIcon, ChevronDownIcon, DownloadIcon } from "@/components/shell/icons";
import { useToast } from "@/components/toast";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { EMPTY_PATIENT_IDENTITY_CATALOGS, type PatientIdentityCatalogs } from "@/features/patients/data";
import type { ReferenceValue } from "./catalog-data";
import { CompleteEncounterPrincipalDiagnosisModal } from "./complete-encounter-principal-diagnosis-modal";
import { CompleteEncounterRipsFieldModal } from "./complete-encounter-rips-field-modal";
import { CompleteEncounterRipsServiceModal } from "./complete-encounter-rips-service-modal";
import { CompletePatientRipsDataModal } from "./complete-patient-rips-data-modal";
import {
  groupEncounterPrincipalDiagnosisGaps,
  type EncounterPrincipalDiagnosisGap,
} from "./encounter-principal-diagnosis-gaps";
import { groupEncounterRipsFieldGaps, type EncounterRipsFieldGap } from "./encounter-rips-field-gaps";
import { groupEncounterServiceRipsGaps, type EncounterServiceRipsGap } from "./encounter-service-rips-gaps";
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
import { groupPatientRipsGaps, type PatientRipsGaps } from "./patient-rips-gaps";
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

// PROMPT NINJA "Mejorar selector de período RIPS y mantener UI
// completamente en español" — Chrome's native <input type="month"> shows
// its calendar UI in the browser's own language (English on an
// en-US-configured Chrome), inconsistent with the rest of Odentia. Two
// plain <select>s replace it below, but both still only ever produce the
// exact same "YYYY-MM" string handlePeriodChange() already expects —
// nothing about the period's own representation/effects changes.
export const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// A reasonable operating window, not a hardcoded year: the year ahead
// (so this never needs a code change right as a new year starts) plus
// enough prior years to reach real historical periods — always derived
// from `referenceYear`, never a literal year.
const YEARS_BACK = 3;
export function getPeriodYearOptions(referenceYear: number): number[] {
  const years: number[] = [];
  for (let year = referenceYear + 1; year >= referenceYear - YEARS_BACK; year--) years.push(year);
  return years;
}

function currentPeriod(): RipsExportPeriod {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function periodToInputValue(period: RipsExportPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

export function inputValueToPeriod(value: string): RipsExportPeriod | null {
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

// PROMPT NINJA "Corregir estado 'Listo para generar' cuando el período no
// tiene atenciones" — the ONE place this screen decides which of the 3
// visible states applies, so the banner text and the Generar RIPS button
// can never disagree the way they used to: readiness.ready alone used to
// say "Listo para generar" even with 0 atenciones, while the button's own
// disabled= already correctly required encounterCount > 0 too. "0
// atenciones, sin blockers" is a valid empty state, never an invented
// blocker (Section 3) — it's distinguished from "blockers" here, not
// folded into it.
export type RipsGenerateState = "blockers" | "empty-period" | "ready";

export function getRipsGenerateState(readinessReady: boolean | undefined, encounterCount: number | undefined): RipsGenerateState {
  if (!readinessReady) return "blockers";
  return (encounterCount ?? 0) > 0 ? "ready" : "empty-period";
}

export function RipsScreen({
  identityCatalogs = EMPTY_PATIENT_IDENTITY_CATALOGS,
  finalidadOptions = [],
  causaMotivoOptions = [],
  diagnosisTypeOptions = [],
}: {
  identityCatalogs?: PatientIdentityCatalogs;
  // Fetched once, server-side, same convention as identityCatalogs above
  // — never re-fetched per modal open, and never hardcoded (see
  // CompleteEncounterRipsFieldModal's own comment).
  finalidadOptions?: ReferenceValue[];
  causaMotivoOptions?: ReferenceValue[];
  diagnosisTypeOptions?: ReferenceValue[];
} = {}) {
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
  // Prompt Ninja "corregir datos faltantes del paciente sin salir de
  // /rips" — the one patient-scope group currently open for correction,
  // grouped by patient_id (never one modal per readiness error — see
  // patient-rips-gaps.ts).
  const [correctingGaps, setCorrectingGaps] = useState<PatientRipsGaps | null>(null);
  // Prompt Master A4B — the one encounter's RIPS_SERVICE_CONFIGURATION_MISSING
  // group currently open for correction, grouped by encounter_id (see
  // encounter-service-rips-gaps.ts).
  const [correctingEncounterGap, setCorrectingEncounterGap] = useState<EncounterServiceRipsGap | null>(null);
  // RIPS — the one encounter's SERVICE_FINALIDAD_MISSING/
  // CONSULTATION_CAUSA_MOTIVO_MISSING group currently open for correction
  // (see encounter-rips-field-gaps.ts) — a DIFFERENT modal from the one
  // above: that one applies ONE derived clinic-wide configuration in one
  // click, this one requires an active clinical professional choosing an
  // explicit value per missing field.
  const [correctingFieldGap, setCorrectingFieldGap] = useState<EncounterRipsFieldGap | null>(null);
  // RIPS — the one encounter's ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING
  // group currently open for correction (see
  // encounter-principal-diagnosis-gaps.ts) — the same clinically
  // authorized, add-only, finalized-only correction Historia Clínica's
  // own Atenciones tab uses (CompleteEncounterPrincipalDiagnosisModal),
  // reused unchanged here so a clinic_admin who is ALSO clinically
  // active can resolve it without leaving /rips.
  const [correctingPrincipalDiagnosisGap, setCorrectingPrincipalDiagnosisGap] = useState<EncounterPrincipalDiagnosisGap | null>(null);

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

  // Re-resolves readiness for the CURRENTLY selected period after saving a
  // patient's missing RIPS fields OR applying a confirmed Servicio RIPS
  // to a historical encounter — same getRipsPeriodSummaryAction the
  // period selector itself already uses, so a resolved pendiente
  // disappears automatically without a full reload and without leaving
  // /rips. Deliberately does NOT reuse applySummaryResult (which also
  // resets showPending — correct for a genuine period change, but here it
  // would collapse the very list the admin just fixed something in).
  const refreshReadinessInPlace = async () => {
    const result = await getRipsPeriodSummaryAction(period);
    if (result.status === "error") {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setSummary(result.summary);
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
  const patientGaps = readiness ? groupPatientRipsGaps(readiness.errors) : [];
  const encounterServiceGaps = readiness ? groupEncounterServiceRipsGaps(readiness.errors) : [];
  const encounterFieldGaps = readiness ? groupEncounterRipsFieldGaps(readiness.errors) : [];
  const encounterPrincipalDiagnosisGaps = readiness ? groupEncounterPrincipalDiagnosisGaps(readiness.errors) : [];
  const yearOptions = getPeriodYearOptions(new Date().getFullYear());
  const generateState = getRipsGenerateState(readiness?.ready, summary?.encounterCount);
  const canGenerate = generateState === "ready";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <section className="rounded-xl border border-border bg-background p-4 sm:p-5">
        <p className="text-[11px] text-label-foreground">Período</p>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] text-label-foreground">Mes</span>
            <select
              id="rips-period-month"
              value={period.month}
              onChange={(e) => handlePeriodChange(periodToInputValue({ year: period.year, month: Number(e.target.value) }))}
              className={`${FIELD_CLASS} sm:max-w-[10rem]`}
            >
              {MONTH_NAMES_ES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] text-label-foreground">Año</span>
            <select
              id="rips-period-year"
              value={period.year}
              onChange={(e) => handlePeriodChange(periodToInputValue({ year: Number(e.target.value), month: period.month }))}
              className={`${FIELD_CLASS} sm:max-w-[8rem]`}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
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
            {generateState === "ready" ? (
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CheckCircleIcon className="size-5 shrink-0" />
                Listo para generar
              </div>
            ) : generateState === "empty-period" ? (
              // Sin blockers de configuración/readiness, pero 0 atenciones
              // exportables — nunca "Listo para generar", pero tampoco un
              // pendiente ficticio: esto NO es un blocker, es un período
              // vacío legítimo.
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <CheckCircleIcon className="size-5 shrink-0" />
                  Configuración RIPS completa
                </div>
                <p className="pl-7 text-xs text-muted-foreground">No hay atenciones para generar RIPS en este período.</p>
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
                          {group.errors.map((error, index) => {
                            // Patient-scope pendientes never leave /rips
                            // anymore — "Corregir" opens the SAME grouped
                            // modal (by patient_id) regardless of which of
                            // that patient's several missing fields this
                            // particular row is for (see
                            // groupPatientRipsGaps).
                            const gapsForPatient =
                              error.scope === "patient" ? patientGaps.find((g) => g.patientId === error.patientId) : undefined;
                            // RIPS_SERVICE_CONFIGURATION_MISSING pendientes
                            // (A4B) never leave /rips either — "Corregir"
                            // opens the SAME grouped modal (by
                            // encounter_id) regardless of which of that
                            // encounter's several affected services this
                            // particular row is for (see
                            // groupEncounterServiceRipsGaps). Every other
                            // code/scope keeps its existing fixHref
                            // navigation unchanged.
                            const gapsForEncounterService =
                              error.code === "RIPS_SERVICE_CONFIGURATION_MISSING"
                                ? encounterServiceGaps.find((g) => g.encounterId === error.encounterId)
                                : undefined;
                            // SERVICE_FINALIDAD_MISSING/CONSULTATION_CAUSA_MOTIVO_MISSING
                            // never leave /rips either — "Corregir" opens
                            // the SAME grouped modal (by encounter_id)
                            // regardless of which of that encounter's
                            // several missing fields this particular row
                            // is for (see encounter-rips-field-gaps.ts).
                            const gapsForField =
                              error.code === "SERVICE_FINALIDAD_MISSING" || error.code === "CONSULTATION_CAUSA_MOTIVO_MISSING"
                                ? encounterFieldGaps.find((g) => g.encounterId === error.encounterId)
                                : undefined;
                            // ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING never
                            // leaves /rips either — "Corregir" opens the
                            // SAME modal Historia Clínica's own
                            // Atenciones tab uses (see
                            // encounter-principal-diagnosis-gaps.ts).
                            const gapsForPrincipalDiagnosis =
                              error.code === "ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING"
                                ? encounterPrincipalDiagnosisGaps.find((g) => g.encounterId === error.encounterId)
                                : undefined;
                            return (
                              <li key={`${error.code}-${index}`} className="flex items-start justify-between gap-2 text-sm text-foreground/80">
                                <span>{error.message}</span>
                                {gapsForPatient ? (
                                  <button
                                    type="button"
                                    onClick={() => setCorrectingGaps(gapsForPatient)}
                                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                                  >
                                    Corregir
                                  </button>
                                ) : gapsForEncounterService ? (
                                  <button
                                    type="button"
                                    onClick={() => setCorrectingEncounterGap(gapsForEncounterService)}
                                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                                  >
                                    Corregir
                                  </button>
                                ) : gapsForField ? (
                                  <button
                                    type="button"
                                    onClick={() => setCorrectingFieldGap(gapsForField)}
                                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                                  >
                                    Corregir
                                  </button>
                                ) : gapsForPrincipalDiagnosis ? (
                                  <button
                                    type="button"
                                    onClick={() => setCorrectingPrincipalDiagnosisGap(gapsForPrincipalDiagnosis)}
                                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                                  >
                                    Corregir
                                  </button>
                                ) : (
                                  error.fixHref && (
                                    <a href={error.fixHref} className="shrink-0 text-xs font-medium text-primary hover:underline">
                                      Corregir
                                    </a>
                                  )
                                )}
                              </li>
                            );
                          })}
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
              disabled={!canGenerate || generating}
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

      {correctingGaps && (
        <CompletePatientRipsDataModal
          gaps={correctingGaps}
          identityCatalogs={identityCatalogs}
          onClose={() => setCorrectingGaps(null)}
          onSaved={async () => {
            setCorrectingGaps(null);
            showToast("Datos del paciente actualizados.");
            await refreshReadinessInPlace();
          }}
        />
      )}

      {correctingEncounterGap && (
        <CompleteEncounterRipsServiceModal
          encounterId={correctingEncounterGap.encounterId}
          onClose={() => setCorrectingEncounterGap(null)}
          onApplied={async () => {
            setCorrectingEncounterGap(null);
            showToast("Servicio RIPS aplicado.");
            await refreshReadinessInPlace();
          }}
        />
      )}

      {correctingFieldGap && (
        <CompleteEncounterRipsFieldModal
          encounterId={correctingFieldGap.encounterId}
          finalidadOptions={finalidadOptions}
          causaMotivoOptions={causaMotivoOptions}
          onClose={() => setCorrectingFieldGap(null)}
          onFieldCorrected={() => {
            // Deliberately does NOT close the modal or show a toast per
            // field — several fields across several services in the same
            // encounter may still need a value, and the row disappearing
            // inside the modal is already the save's own feedback. Only
            // readiness (the summary badge/pendientes list behind the
            // modal) refreshes in place, same as every other correction
            // flow on this screen.
            refreshReadinessInPlace();
          }}
        />
      )}

      {correctingPrincipalDiagnosisGap && (
        <CompleteEncounterPrincipalDiagnosisModal
          encounterId={correctingPrincipalDiagnosisGap.encounterId}
          diagnosisTypeOptions={diagnosisTypeOptions}
          onClose={() => setCorrectingPrincipalDiagnosisGap(null)}
          onCorrected={() => {
            setCorrectingPrincipalDiagnosisGap(null);
            showToast("Diagnóstico principal agregado.");
            refreshReadinessInPlace();
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
