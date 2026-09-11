"use client";

import { useState } from "react";
import { AlertTriangleIcon, CheckCircleIcon } from "@/components/shell/icons";
import { updatePrimaryLocation } from "@/features/clinic/actions";
import type { PrimaryLocation } from "@/features/clinic/data";
import { getRipsClinicConfigStatus } from "@/features/clinic/rips-config-status";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";

// "Configuración RIPS" — PROMPT NINJA "Crear bloque dedicado Configuración
// RIPS en Clínica". Anchor target for /rips's own "Corregir" links
// (fixHref: "/clinica#rips" — see export-readiness.ts) — those blockers
// used to land on a bare /clinica, forcing the admin to hunt for "Código
// de habilitación (REPS)" buried at the end of "Ubicación de la sede
// principal" (see primary-location-section.tsx, which no longer owns
// this field). Readiness comes from getRipsClinicConfigStatus() — a thin
// wrapper around the SAME getRipsExportReadiness() /rips itself calls —
// never a second, parallel notion of "ready" that could disagree with it.
//
// NIT stays editable ONLY in "Información general" above (this task's own
// "evita dos formularios independientes para editar el mismo valor") —
// shown here read-only, driven by the SAME lifted `taxId` state
// clinic-settings-screen.tsx passes to InformacionGeneralSection, so a
// save there updates this block immediately — no polling, no new global
// state.
function FieldStatusTag({ ok }: { ok: boolean }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${ok ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
      {ok ? "Configurado" : "Pendiente"}
    </span>
  );
}

export function RipsConfigSection({
  taxId,
  location,
  codPrestador,
  onCodPrestadorSaved,
}: {
  taxId: string;
  location: PrimaryLocation | null;
  codPrestador: string;
  onCodPrestadorSaved: (next: string) => void;
}) {
  const [draft, setDraft] = useState(codPrestador);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasTaxId = taxId.trim() !== "";
  const hasCodPrestador = codPrestador.trim() !== "";

  const status = getRipsClinicConfigStatus({
    clinicTaxId: taxId.trim() || null,
    location: location ? { id: location.id, name: location.name, codPrestador: codPrestador.trim() || null } : null,
  });

  const handleSave = async () => {
    if (!location) return;
    setSaving(true);
    setError(null);
    const trimmed = draft.trim();
    if (trimmed !== "" && !/^\d{12}$/.test(trimmed)) {
      setSaving(false);
      setError("Debe tener exactamente 12 dígitos.");
      return;
    }
    const outcome = await updatePrimaryLocation(location.id, { cod_prestador: trimmed || null });
    setSaving(false);
    if (outcome.status === "error") {
      setError("No pudimos guardar el código. Intenta de nuevo.");
      return;
    }
    onCodPrestadorSaved(trimmed);
  };

  return (
    // scroll-mt accounts for the app shell's own sticky header (h-20 on
    // desktop) so /clinica#rips lands with the block fully visible, not
    // tucked under it — plain CSS, no JS scroll handling.
    <div id="rips" className="scroll-mt-24 rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold">Configuración RIPS</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Datos requeridos para preparar y generar los archivos RIPS de tu clínica.
      </p>

      <div
        className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
          status.ready ? "border-success/25 bg-success/10 text-success" : "border-warning/25 bg-warning/10 text-warning"
        }`}
      >
        {status.ready ? (
          <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
        ) : (
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-medium">{status.ready ? "Configuración RIPS lista" : "Configuración incompleta"}</p>
          {!status.ready && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
              {status.errors.map((e) => (
                <li key={e.code}>{e.message}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-label-foreground">NIT / identificación del prestador</dt>
          <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
            <span className={hasTaxId ? "" : "text-muted-foreground"}>{hasTaxId ? taxId : "No configurado"}</span>
            <FieldStatusTag ok={hasTaxId} />
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">Se edita en “Información general”, arriba en esta misma página.</p>
        </div>

        <div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-2 text-xs text-label-foreground">
              Código de habilitación (REPS)
              <FieldStatusTag ok={hasCodPrestador} />
            </span>
            <input
              className={FIELD_CLASS}
              value={draft}
              placeholder="No configurado"
              maxLength={12}
              disabled={!location}
              onChange={(e) => {
                setError(null);
                setDraft(e.target.value);
              }}
            />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Código de 12 dígitos asignado por el Ministerio de Salud a esta sede en el Registro Especial de
            Prestadores de Servicios de Salud (REPS). Si no lo tienes a la mano, puedes consultarlo en el REPS o
            preguntarle a quien gestionó la habilitación de la sede.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!location || saving || draft.trim() === codPrestador.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar código"}
            </button>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
