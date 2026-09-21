"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/shell/icons";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import type { ReferenceValue } from "./catalog-data";
import { correctEncounterServiceRipsFieldAction, fetchEncounterRipsFieldGapContextAction } from "./encounter-rips-field-actions";
import type { EncounterRipsFieldGapContext, EncounterRipsFieldGapService } from "./encounter-rips-field-gap-data";

type FieldKey = "finalidad_code" | "causa_motivo_code";

function fieldRowKey(serviceId: string, field: FieldKey): string {
  return `${serviceId}:${field}`;
}

// RIPS — "Completar Finalidad/Causa" for a historical FINALIZED
// encounter. Grouped by encounterId for context (see
// encounter-rips-field-gaps.ts), but every save is ONE explicit RPC call
// for ONE service + ONE field + ONE professional-chosen value
// (correct_encounter_service_rips_field) — never a batch/"apply to all",
// never inferred from Finalidad, CUPS, diagnosis or specialty. Only ever
// shows a field that's currently missing — a field that already has a
// value is never rendered as editable here (see this task's own UX
// instruction).
//
// `canCorrect` comes back from fetchEncounterRipsFieldGapContextAction
// itself (canEditClinicalData(), the real is_active_clinical_professional()
// mirror), re-resolved fresh every time this modal opens — never a role
// name or a value threaded down from somewhere else that could go stale
// mid-session. When false, the context (patient/services/missing fields)
// still shows — never hidden — but nothing is editable: an honest,
// explicit explanation replaces the form instead of a button that would
// only fail.
export function CompleteEncounterRipsFieldModal({
  encounterId,
  finalidadOptions,
  causaMotivoOptions,
  onClose,
  onFieldCorrected,
}: {
  encounterId: string;
  finalidadOptions: ReferenceValue[];
  causaMotivoOptions: ReferenceValue[];
  onClose: () => void;
  onFieldCorrected: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [context, setContext] = useState<EncounterRipsFieldGapContext | null>(null);
  const [canCorrect, setCanCorrect] = useState(false);
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const outcome = await fetchEncounterRipsFieldGapContextAction(encounterId);
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

  const handleSave = async (service: EncounterRipsFieldGapService, field: FieldKey) => {
    const key = fieldRowKey(service.id, field);
    const value = selectedValues[key];
    if (!value) {
      setRowErrors((prev) => ({ ...prev, [key]: "Selecciona un valor." }));
      return;
    }
    setPendingRows((prev) => new Set(prev).add(key));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    const outcome = await correctEncounterServiceRipsFieldAction({ serviceId: service.id, field, value });

    setPendingRows((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

    if (outcome.status === "error") {
      setRowErrors((prev) => ({ ...prev, [key]: outcome.message }));
      return;
    }

    // Field resolved — drop it from local state so it stops rendering as
    // editable, and let the parent screen refresh readiness in place
    // (never a full reload, never closes this modal by itself — several
    // fields across several services in the same encounter may still be
    // missing).
    setContext((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        services: prev.services
          .map((s) =>
            s.id === service.id
              ? {
                  ...s,
                  missingFinalidad: field === "finalidad_code" ? false : s.missingFinalidad,
                  missingCausaMotivo: field === "causa_motivo_code" ? false : s.missingCausaMotivo,
                }
              : s,
          )
          .filter((s) => s.missingFinalidad || s.missingCausaMotivo),
      };
    });
    onFieldCorrected();
  };

  const allResolved = context !== null && context.services.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Completar Finalidad/Causa"
        className="relative z-10 flex w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:w-full sm:max-w-md sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Completar Finalidad/Causa</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {loadError && <p className="text-sm text-danger">{loadError}</p>}

          {!loading && context && (
            <>
              <div className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="font-medium text-foreground">{context.patientName}</p>
                <p className="text-xs text-muted-foreground">{context.encounterDateLabel}</p>
              </div>

              {!canCorrect && (
                <p className="rounded-lg border border-warning/25 bg-warning/10 p-2.5 text-sm text-warning">
                  Esta corrección requiere un profesional clínico activo de la clínica.
                </p>
              )}

              {allResolved && <p className="text-sm text-muted-foreground">Ya no hay Finalidad/Causa pendientes en esta atención.</p>}

              {context.services.map((service) => (
                <div key={service.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-foreground">{service.clinicalConceptNameSnapshot ?? service.cupsCode}</p>
                  <p className="text-xs text-muted-foreground">
                    CUPS {service.cupsCode} · {service.ripsServiceType === "consultation" ? "Consulta" : "Procedimiento"}
                  </p>

                  {service.missingFinalidad && (
                    <FieldRow
                      label="Finalidad de la atención"
                      options={finalidadOptions}
                      value={selectedValues[fieldRowKey(service.id, "finalidad_code")] ?? ""}
                      onChange={(v) => setSelectedValues((prev) => ({ ...prev, [fieldRowKey(service.id, "finalidad_code")]: v }))}
                      onSave={() => handleSave(service, "finalidad_code")}
                      disabled={!canCorrect}
                      pending={pendingRows.has(fieldRowKey(service.id, "finalidad_code"))}
                      error={rowErrors[fieldRowKey(service.id, "finalidad_code")]}
                    />
                  )}

                  {service.missingCausaMotivo && (
                    <FieldRow
                      label="Causa o motivo de la consulta"
                      options={causaMotivoOptions}
                      value={selectedValues[fieldRowKey(service.id, "causa_motivo_code")] ?? ""}
                      onChange={(v) => setSelectedValues((prev) => ({ ...prev, [fieldRowKey(service.id, "causa_motivo_code")]: v }))}
                      onSave={() => handleSave(service, "causa_motivo_code")}
                      disabled={!canCorrect}
                      pending={pendingRows.has(fieldRowKey(service.id, "causa_motivo_code"))}
                      error={rowErrors[fieldRowKey(service.id, "causa_motivo_code")]}
                    />
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  options,
  value,
  onChange,
  onSave,
  disabled,
  pending,
  error,
}: {
  label: string;
  options: ReferenceValue[];
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  disabled: boolean;
  pending: boolean;
  error?: string;
}) {
  return (
    <div className="mt-2.5 flex flex-col gap-1.5 border-t border-border pt-2.5">
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || pending}
          className={`${FIELD_CLASS} flex-1`}
        >
          <option value="">Selecciona…</option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.code} — {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || pending || !value}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
