"use client";

import { useEffect, useState } from "react";
import { OdontogramPreview, type FindingType } from "@/features/dashboard/odontogram-teeth";
import { createClient } from "@/lib/supabase/client";
import { EditOdontogramaModal } from "./edit-odontograma-modal";
import { resolveUpdatedByProfessional, type UpdatedByProfessional } from "./resolve-updated-by";
import { toOdontogramData, type ToothFindingRecord } from "./tooth-findings-data";

// Restores the approved demo's exact Odontograma layout
// (clinical-record-screen.tsx's OdontogramaTab: dashed chart box + legend
// on the left, "Hallazgos" panel on the right, grid-cols-1 lg:[3fr_1fr]) —
// not redesigned. The only thing that changed is the data source: real
// public.patient_tooth_findings rows (see the migration and
// tooth-findings-data.ts), reshaped into the same OdontogramData the
// shared OdontogramPreview already expects. An empty odontogram (zero
// findings) is a valid, always-rendered state — never an "unavailable"
// placeholder (see task scope).
const FINDING_LEGEND: { type: FindingType; label: string; dotClass: string }[] = [
  { type: "caries", label: "Caries", dotClass: "bg-danger" },
  { type: "restauracion", label: "Restauración", dotClass: "bg-info" },
  { type: "ausente", label: "Ausente", dotClass: "bg-muted-foreground" },
  { type: "otro", label: "Otro", dotClass: "bg-warning" },
];

const FINDING_LABEL: Record<FindingType, string> = {
  caries: "Caries",
  restauracion: "Restauración",
  ausente: "Ausente",
  otro: "Otro",
};

function dotClassForType(type: FindingType): string {
  return FINDING_LEGEND.find((f) => f.type === type)?.dotClass ?? "bg-muted-foreground";
}

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });

// One row per tooth that has at least one finding — the LATEST finding for
// that tooth (by created_at, same "latest wins" rule OdontogramPreview
// itself already uses for coloring), sorted by FDI ascending. Mirrors
// getOdontogramFindingRows() from clinical-record-screen.tsx exactly.
function getFindingRows(findings: ToothFindingRecord[]) {
  const byTooth = new Map<number, ToothFindingRecord[]>();
  for (const finding of findings) {
    byTooth.set(finding.toothFdi, [...(byTooth.get(finding.toothFdi) ?? []), finding]);
  }
  return Array.from(byTooth.entries())
    .map(([fdi, toothFindings]) => {
      const latest = toothFindings[toothFindings.length - 1];
      return { fdi, latest };
    })
    .sort((a, b) => a.fdi - b.fdi);
}

export function OdontogramaTab({
  patientId,
  patientName,
  clinicId,
  findings,
  canEdit,
  onChanged,
}: {
  patientId: string;
  patientName: string;
  clinicId: string | null;
  findings: ToothFindingRecord[];
  canEdit: boolean;
  onChanged: (findings: ToothFindingRecord[]) => void;
}) {
  const [showEdit, setShowEdit] = useState(false);

  // Resolves each finding's recorded_by (a profiles.id) to a real
  // name/specialty — reuses fetchTeamMembers via resolveUpdatedByProfessional
  // (see resolve-updated-by.ts), one clinic-team fetch shared across every
  // distinct professional in this patient's findings, not one query per
  // finding.
  const [resolvedByProfileId, setResolvedByProfileId] = useState<Map<string, UpdatedByProfessional>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clinicId) {
        if (!cancelled) setResolvedByProfileId(new Map());
        return;
      }
      const profileIds = Array.from(new Set(findings.map((f) => f.recordedBy).filter((id): id is string => Boolean(id))));
      if (profileIds.length === 0) {
        if (!cancelled) setResolvedByProfileId(new Map());
        return;
      }
      try {
        const supabase = createClient();
        const entries = await Promise.all(
          profileIds.map(async (id) => [id, await resolveUpdatedByProfessional(supabase, clinicId, id)] as const),
        );
        if (!cancelled) {
          const next = new Map<string, UpdatedByProfessional>();
          for (const [id, resolved] of entries) if (resolved) next.set(id, resolved);
          setResolvedByProfileId(next);
        }
      } catch {
        if (!cancelled) setResolvedByProfileId(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, findings]);

  const odontogram = toOdontogramData(findings);
  const findingCount = Object.keys(odontogram).length;
  const findingRows = getFindingRows(findings);

  // Most recently updated finding overall (not per-tooth) — feeds the
  // header's "Actualizado [fecha] · [odontólogo]" line, same pattern as
  // Antecedentes' own updated_by metadata (see antecedentes-tab.tsx).
  const lastUpdatedFinding = findings.reduce<ToothFindingRecord | null>(
    (latest, f) => (!latest || f.updatedAt > latest.updatedAt ? f : latest),
    null,
  );
  const lastUpdatedByName = lastUpdatedFinding?.recordedBy
    ? resolvedByProfileId.get(lastUpdatedFinding.recordedBy)?.name
    : undefined;

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Odontograma</p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {lastUpdatedFinding
              ? `Actualizado ${DATE_FORMATTER.format(new Date(lastUpdatedFinding.updatedAt))}${lastUpdatedByName ? ` · ${lastUpdatedByName}` : ""}`
              : "Sin registrar"}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
            >
              Actualizar odontograma
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_1fr]">
        <div className="min-w-0 rounded-lg border border-dashed border-border px-4 py-4">
          <OdontogramPreview odontogram={odontogram} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              {findingCount > 0 ? `${findingCount} pieza(s) con hallazgos registrados.` : "Sin hallazgos registrados."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {FINDING_LEGEND.map(({ type, label, dotClass }) => (
                <span key={type} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={`size-2 rounded-full ${dotClass}`} aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold text-foreground">Hallazgos</p>
          {findingRows.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Sin hallazgos registrados.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2.5">
              {findingRows.map(({ fdi, latest }) => {
                const resolved = latest.recordedBy ? resolvedByProfileId.get(latest.recordedBy) : undefined;
                return (
                  <li key={fdi} className="rounded-lg border border-border/70 p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`size-2 shrink-0 rounded-full ${dotClassForType(latest.findingType)}`} aria-hidden="true" />
                      <p className="text-xs font-semibold text-foreground">
                        Pieza {fdi} · {FINDING_LABEL[latest.findingType]}
                      </p>
                    </div>
                    {latest.note && <p className="mt-1 text-xs text-foreground/80">{latest.note}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {DATE_FORMATTER.format(new Date(latest.updatedAt))} · {resolved?.name ?? "Sin registrar"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {showEdit && (
        <EditOdontogramaModal
          patientId={patientId}
          patientName={patientName}
          findings={findings}
          onClose={() => setShowEdit(false)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
