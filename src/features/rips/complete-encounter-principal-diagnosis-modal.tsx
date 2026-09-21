"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import type { ReferenceValue } from "./catalog-data";
import { CodeSearchAutocomplete, type CodeSearchResult } from "./code-search-autocomplete";
import { DIAGNOSIS_BROWSE_SECTIONS, DIAGNOSIS_INITIAL_SUGGESTIONS, searchDentalDiagnosesAction } from "./diagnosis-search-config";
import {
  addMissingFinalizedEncounterPrincipalDiagnosisAction,
  fetchEncounterPrincipalDiagnosisGapContextAction,
} from "./encounter-principal-diagnosis-actions";
import { searchDiagnosesAction } from "./actions";
import type { EncounterPrincipalDiagnosisGapContext } from "./encounter-principal-diagnosis-gap-data";

// "Completar diagnóstico principal" for a historical FINALIZED encounter
// (ENCOUNTER_PRINCIPAL_DIAGNOSIS_MISSING). Add-only, single-shot: this
// surface exists exclusively to fill an encounter that currently has NO
// principal diagnosis at all — never a general diagnosis editor. No
// related diagnoses, no delete, no editing an existing principal, no
// touching encounter_services, no reopening the encounter. The one
// mutation (add_missing_finalized_encounter_principal_diagnosis) is
// itself missing-only and rejects a second attempt regardless of what
// this UI shows — this modal's own `hasPrincipal` re-check (fresh from
// the DB on every open) is defense-in-depth, not the real guard.
//
// Reuses the EXACT same CIE-10 dental-first search/browse the real
// clinical encounter screen uses (diagnosis-search-config.ts, extracted
// from real-clinical-encounter-screen.tsx for this reuse — never a
// second, drifting copy) — same Frecuentes → Examen odontológico →
// Odontología → Todos priority, same explicit-expansion typed search.
// diagnosisTypeCode is always manual selection from the real
// RIPSTipoDiagnosticoPrincipalVersion2 catalog — never defaulted, not
// even for Z012 (see the regulatory audit this task's own report
// references: no official mapping exists).
export type AddedPrincipalDiagnosis = { id: string; sequence: number; cie10Code: string; diagnosisTypeCode: string | null };

export function CompleteEncounterPrincipalDiagnosisModal({
  encounterId,
  diagnosisTypeOptions,
  onClose,
  onCorrected,
}: {
  encounterId: string;
  diagnosisTypeOptions: ReferenceValue[];
  onClose: () => void;
  onCorrected: (added: AddedPrincipalDiagnosis) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [context, setContext] = useState<EncounterPrincipalDiagnosisGapContext | null>(null);
  const [canCorrect, setCanCorrect] = useState(false);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<CodeSearchResult | null>(null);
  const [diagnosisTypeCode, setDiagnosisTypeCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const outcome = await fetchEncounterPrincipalDiagnosisGapContextAction(encounterId);
      if (cancelled) return;
      setLoading(false);
      if (outcome.status === "error") {
        setLoadError(outcome.message);
        return;
      }
      setContext(outcome.context);
      setCanCorrect(outcome.canCorrect);
    })();
    return () => {
      cancelled = true;
    };
  }, [encounterId]);

  const requiresType = context?.requiresDiagnosisType ?? false;
  const canSave = selectedDiagnosis !== null && (!requiresType || diagnosisTypeCode !== "");

  const handleSave = async () => {
    if (!selectedDiagnosis || !canSave) return;
    setSaving(true);
    setSaveError(null);
    const outcome = await addMissingFinalizedEncounterPrincipalDiagnosisAction({
      encounterId,
      cie10Code: selectedDiagnosis.code,
      diagnosisTypeCode: diagnosisTypeCode || null,
    });
    setSaving(false);
    if (outcome.status === "error") {
      // Deliberately never closes on error — same convention as every
      // other correction modal in this feature.
      setSaveError(outcome.message);
      return;
    }
    onCorrected({ id: outcome.id, sequence: outcome.sequence, cie10Code: outcome.cie10Code, diagnosisTypeCode: outcome.diagnosisTypeCode });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Completar diagnóstico principal"
        className="relative z-10 flex w-full flex-col overflow-visible rounded-t-2xl bg-background shadow-xl sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Completar diagnóstico principal</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {loadError && <p className="text-sm text-danger">{loadError}</p>}

          {!loading && context && (
            <>
              <div className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="font-medium text-foreground">{context.patientName}</p>
                <p className="text-xs text-muted-foreground">{context.encounterDateLabel}</p>
              </div>

              {context.hasPrincipal ? (
                <p className="text-sm text-muted-foreground">Esta atención ya tiene un diagnóstico principal registrado.</p>
              ) : !canCorrect ? (
                <p className="rounded-lg border border-warning/25 bg-warning/10 p-2.5 text-sm text-warning">
                  Esta corrección requiere un profesional clínico activo de la clínica.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-foreground/80">Diagnóstico principal (CIE-10)</span>
                    <CodeSearchAutocomplete
                      value={selectedDiagnosis?.code ?? ""}
                      displayDescription={selectedDiagnosis ? `${selectedDiagnosis.code} — ${selectedDiagnosis.description}` : ""}
                      search={searchDiagnosesAction}
                      dentalSearch={searchDentalDiagnosesAction}
                      initialSuggestions={DIAGNOSIS_INITIAL_SUGGESTIONS}
                      browse={DIAGNOSIS_BROWSE_SECTIONS}
                      onChange={setSelectedDiagnosis}
                      placeholder="Buscar por código o descripción…"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-foreground/80">
                      Tipo de diagnóstico{requiresType ? "" : " (opcional)"}
                    </span>
                    <select value={diagnosisTypeCode} onChange={(e) => setDiagnosisTypeCode(e.target.value)} className={FIELD_CLASS}>
                      <option value="">Selecciona…</option>
                      {diagnosisTypeOptions.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.code} — {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {saveError && <p className="text-xs text-danger">{saveError}</p>}
                </>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5">
            Cerrar
          </button>
          {context && !context.hasPrincipal && canCorrect && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
