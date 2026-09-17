"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/shell/icons";
import {
  applyConfirmedSpecialtyRipsServiceToEncounterAction,
  fetchEncounterRipsServiceGapContextAction,
} from "./encounter-rips-service-actions";
import type { EncounterRipsServiceGapContext } from "./encounter-rips-service-gap-data";

// Prompt Master A4B — "Completar Servicio RIPS". NOT a picker: the admin
// never chooses Grupo/Servicio here — she reviews the clinic's own
// CURRENTLY confirmed clinic_specialty_rips_services configuration for
// this encounter's specialty and either applies it (one click,
// apply_confirmed_specialty_rips_service_to_encounter, SECURITY DEFINER,
// re-derives and re-validates everything itself server-side) or, if
// nothing is confirmed yet, is sent to /clinica#rips to confirm it first —
// same "no picker, no free-form input, no global default fallback" rule
// A4 itself already established.
//
// Grouped by encounterId (see encounter-service-rips-gaps.ts) — every
// "Corregir" on this encounter's own RIPS_SERVICE_CONFIGURATION_MISSING
// pendientes opens this SAME modal, listing every affected service at
// once, never one modal per service.
export function CompleteEncounterRipsServiceModal({
  encounterId,
  onClose,
  onApplied,
}: {
  encounterId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [context, setContext] = useState<EncounterRipsServiceGapContext | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const outcome = await fetchEncounterRipsServiceGapContextAction(encounterId);
      if (cancelled) return;
      setLoading(false);
      if (outcome.status === "error") {
        setLoadError(outcome.message);
        return;
      }
      setContext(outcome.context);
    })();
    return () => {
      cancelled = true;
    };
  }, [encounterId]);

  const handleApply = async () => {
    setApplying(true);
    setApplyError(null);
    const outcome = await applyConfirmedSpecialtyRipsServiceToEncounterAction(encounterId);
    setApplying(false);
    if (outcome.status === "error") {
      // Deliberately never closes on error — the admin needs to see why,
      // same "no cerrar en error" convention as the patient modal.
      setApplyError(outcome.message);
      return;
    }
    onApplied();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Completar Servicio RIPS"
        className="relative z-10 flex w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:w-full sm:max-w-sm sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Completar Servicio RIPS</p>
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
              <p className="text-xs text-muted-foreground">
                Esta atención se finalizó antes de que la clínica tuviera configurado el Servicio RIPS. Revisa la
                configuración actual antes de aplicarla.
              </p>

              <div className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="font-medium text-foreground">{context.patientName}</p>
                <p className="text-xs text-muted-foreground">{context.encounterDateLabel}</p>
                {context.professionalName && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Profesional: <span className="text-foreground">{context.professionalName}</span>
                  </p>
                )}
                {context.specialtyName && (
                  <p className="text-xs text-muted-foreground">
                    Especialidad: <span className="text-foreground">{context.specialtyName}</span>
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-label-foreground uppercase">
                  Servicios afectados
                </p>
                <ul className="flex flex-col gap-1.5">
                  {context.services.map((service) => (
                    <li key={service.id} className="rounded-lg border border-border p-2.5 text-sm">
                      <p className="font-medium text-foreground">{service.clinicalConceptNameSnapshot ?? service.cupsCode}</p>
                      <p className="text-xs text-muted-foreground">
                        CUPS {service.cupsCode} · Grupo: {service.grupoServiciosCode ?? "Sin configurar"} · Servicio:{" "}
                        {service.codServicioCode ?? "Sin configurar"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-label-foreground uppercase">
                  Configuración confirmada de la clínica
                </p>
                {context.effectiveConfig ? (
                  <p className="rounded-lg border border-success/25 bg-success/10 p-2.5 text-sm font-medium text-success">
                    {context.effectiveConfig.grupoLabel} → {context.effectiveConfig.servicioLabel}
                  </p>
                ) : (
                  <div className="rounded-lg border border-warning/25 bg-warning/10 p-2.5 text-sm text-warning">
                    <p>Esta especialidad todavía no tiene un Servicio RIPS confirmado.</p>
                    <Link href="/clinica#rips" className="mt-1 inline-block text-xs font-medium underline">
                      Configurar en Clínica
                    </Link>
                  </div>
                )}
              </div>

              {applyError && <p className="text-xs text-danger">{applyError}</p>}
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!context?.effectiveConfig || applying}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {applying ? "Aplicando…" : "Aplicar configuración confirmada"}
          </button>
        </div>
      </div>
    </div>
  );
}
