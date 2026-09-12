"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { correctFinalizedEncounterRipsGapsAction } from "./encounter-correction-actions";
import type { ReferenceValue } from "./catalog-data";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

export type ConsultationMissingValue = {
  serviceId: string;
  cupsCode: string;
  description: string | null;
};

// The narrow "Corregir" destination for a finalized encounter's own RIPS
// gaps (see export-readiness.ts's fixHref and encounter-correction-actions.ts).
// Deliberately NOT the full clinical encounter screen — only the two
// fields readiness can flag here are ever shown/editable: incapacidad
// (only while still unset) and vrServicio/"valor cobrado al paciente" per
// consultation still missing one. Never valor pago moderador/concepto de
// recaudo — those aren't RIPS-blocking and this screen has no business
// touching them.
export function EncounterRipsCorrectionScreen({
  encounterId,
  patientName,
  occurredAt,
  incapacityCode,
  incapacityOptions,
  consultationsMissingValue,
}: {
  encounterId: string;
  patientName: string;
  occurredAt: string;
  incapacityCode: string | null;
  incapacityOptions: ReferenceValue[];
  consultationsMissingValue: ConsultationMissingValue[];
}) {
  const router = useRouter();
  const [selectedIncapacityCode, setSelectedIncapacityCode] = useState<string | null>(null);
  const [serviceValues, setServiceValues] = useState<Record<string, string>>(
    () => Object.fromEntries(consultationsMissingValue.map((s) => [s.serviceId, ""])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incapacityMissing = incapacityCode === null;
  const nothingPending = !incapacityMissing && consultationsMissingValue.length === 0;
  const dateLabel = new Date(occurredAt).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });

  const canSave =
    (!incapacityMissing || selectedIncapacityCode !== null) &&
    consultationsMissingValue.every((s) => serviceValues[s.serviceId]?.trim() !== "");

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await correctFinalizedEncounterRipsGapsAction({
      encounterId,
      incapacityCode: incapacityMissing ? selectedIncapacityCode : undefined,
      serviceCorrections: consultationsMissingValue.map((s) => ({
        serviceId: s.serviceId,
        serviceValue: Number(serviceValues[s.serviceId]),
      })),
    });
    if (result.status === "error") {
      setSaving(false);
      setError(result.message);
      return;
    }
    router.push("/rips");
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-6 sm:px-0">
      <button
        type="button"
        onClick={() => router.push("/rips")}
        className="w-fit text-xs font-medium text-foreground/70 hover:text-foreground"
      >
        ← Volver a RIPS
      </button>

      <div>
        <p className="text-sm font-semibold">{patientName}</p>
        <p className="text-xs text-muted-foreground">Atención del {dateLabel}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</div>
      )}

      {nothingPending ? (
        <p className="text-sm text-muted-foreground">Esta atención ya no tiene pendientes RIPS.</p>
      ) : (
        <>
          {incapacityMissing && (
            <div>
              <p className="text-xs font-semibold text-label-foreground uppercase tracking-wide">Incapacidad</p>
              <p className="mt-1 text-xs text-muted-foreground">Falta indicar si hubo incapacidad en esta atención.</p>
              <div className="mt-2 flex items-center gap-2">
                {incapacityOptions.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setSelectedIncapacityCode(opt.code)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selectedIncapacityCode === opt.code
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border text-foreground/70 hover:bg-foreground/5"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {consultationsMissingValue.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-label-foreground uppercase tracking-wide">Valor cobrado al paciente</p>
              <div className="mt-2 flex flex-col gap-3">
                {consultationsMissingValue.map((s) => (
                  <div key={s.serviceId}>
                    <label className="text-[11px] text-label-foreground" htmlFor={`service-value-${s.serviceId}`}>
                      Consulta {s.cupsCode}
                      {s.description ? ` — ${s.description}` : ""}
                    </label>
                    <input
                      id={`service-value-${s.serviceId}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={serviceValues[s.serviceId] ?? ""}
                      onChange={(e) => setServiceValues((prev) => ({ ...prev, [s.serviceId]: e.target.value }))}
                      placeholder="Valor cobrado al paciente"
                      className={`${FIELD_CLASS} mt-1`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar corrección"}
          </button>
        </>
      )}
    </div>
  );
}
