"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { findCupsByCodeAction, findDiagnosisByCodeAction } from "@/features/rips/actions";
import type { ClinicalEncounterRecord, EncounterClinicalData } from "./clinical-encounters-data";
import { resolveUpdatedByProfessional, type UpdatedByProfessional } from "./resolve-updated-by";

// Restores the approved demo's Atenciones layout (clinical-record-screen.tsx's
// AtencionesTab: bg-surface panel, vertical border-l timeline, per-entry dot
// marker, nothing truncated/line-clamped — see that component's own
// comment) — not redesigned. Two deliberate adaptations, both because the
// real model (public.patient_clinical_encounters, see the migration) isn't
// shaped like the demo's mock ClinicalEncounterRecord:
//   - No status badge: a row here already IS a completed encounter, not a
//     scheduled one — the demo's badge only existed because its mock type
//     borrowed AppointmentStatus for that purpose (see the migration's own
//     comment).
//   - Every clinical field (motivo, diagnóstico, procedimientos, notas) gets
//     its own inline line instead of the demo's single "treatment" + optional
//     "findings" — same "nothing hidden, nothing truncated" philosophy,
//     applied to the real field set. That inline-everything behavior is
//     itself what satisfies "clear way to view detail" — no separate modal.
//   - "treatment" (the encounter's own free-text summary of the procedures
//     actually performed, built from patient_clinical_encounter_procedures
//     — see clinical-encounter-draft.ts's buildTreatmentText) is labeled
//     "Procedimientos realizados" here, never "Tratamiento" — that word is
//     reserved for the still-future Tratamiento/Plan de Tratamiento concept
//     and for the treatments catalog's own picker (Nueva cita, "Tratamiento
//     recomendado" for a next visit) — see PROMPT NINJA "Unificar
//     terminología clínica de procedimientos". The underlying field/type
//     name (`treatment`) is untouched — this is a label-only distinction.
const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });

const FIELD_LABELS = [
  { key: "reason", label: "Motivo de consulta" },
  { key: "diagnosis", label: "Diagnóstico / valoración" },
  { key: "treatment", label: "Procedimientos realizados" },
  { key: "notes", label: "Notas clínicas" },
  { key: "indications", label: "Indicaciones al paciente" },
] as const satisfies readonly { key: keyof ClinicalEncounterRecord; label: string }[];

export function AtencionesTab({
  clinicId,
  encounters,
  encounterClinicalData,
}: {
  clinicId: string | null;
  encounters: ClinicalEncounterRecord[];
  // RIPS #4 — diagnósticos/servicios realizados por atención, read-only
  // here (this tab never writes clinical data — that only happens in the
  // real Iniciar/Continuar atención screen). Keyed by encounter id, one
  // batched fetch per page load (see fetchEncounterClinicalDataForEncounters)
  // rather than a query per row.
  encounterClinicalData: Map<string, EncounterClinicalData>;
}) {
  // Resolves each encounter's attended_by (a profiles.id) to a real
  // name/specialty — reuses fetchTeamMembers via resolveUpdatedByProfessional
  // (see resolve-updated-by.ts), same pattern as Antecedentes/Odontograma:
  // one clinic-team fetch shared across every distinct professional in
  // this patient's encounters, not one query per encounter.
  const [resolvedByProfileId, setResolvedByProfileId] = useState<Map<string, UpdatedByProfessional>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clinicId) {
        if (!cancelled) setResolvedByProfileId(new Map());
        return;
      }
      const profileIds = Array.from(new Set(encounters.map((e) => e.attendedBy).filter((id): id is string => Boolean(id))));
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
  }, [clinicId, encounters]);

  // Human descriptions for each diagnosis/service code — the DB only
  // stores the code (see clinical-encounters-data.ts's own comment on why
  // there's no snapshotted description), so resolve against the catalog
  // version that was actually in effect on the date the code was recorded
  // (the diagnosis's encounter occurred_at, the service's own performed_at)
  // — never today's catalog, and never a raw code shown alone. Keyed by
  // "kind:code:onDate" so the same code at two different points in time
  // (a catalog version change) is never conflated.
  const [codeDescriptions, setCodeDescriptions] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const diagnosisLookups = new Map<string, { code: string; onDate: string }>();
      const cupsLookups = new Map<string, { code: string; onDate: string }>();
      for (const encounter of encounters) {
        const data = encounterClinicalData.get(encounter.id);
        if (!data) continue;
        for (const d of data.diagnoses) {
          diagnosisLookups.set(`cie10:${d.cie10Code}:${encounter.occurredAt}`, { code: d.cie10Code, onDate: encounter.occurredAt });
        }
        for (const s of data.services) {
          cupsLookups.set(`cups:${s.cupsCode}:${s.performedAt}`, { code: s.cupsCode, onDate: s.performedAt });
        }
      }
      if (diagnosisLookups.size === 0 && cupsLookups.size === 0) return;
      try {
        const diagnosisEntries = Array.from(diagnosisLookups.entries());
        const cupsEntries = Array.from(cupsLookups.entries());
        const [diagnosisResults, cupsResults] = await Promise.all([
          Promise.all(diagnosisEntries.map(([, { code, onDate }]) => findDiagnosisByCodeAction(code, onDate))),
          Promise.all(cupsEntries.map(([, { code, onDate }]) => findCupsByCodeAction(code, onDate))),
        ]);
        if (cancelled) return;
        const next = new Map<string, string>();
        diagnosisEntries.forEach(([key], i) => {
          if (diagnosisResults[i]) next.set(key, diagnosisResults[i]!.description);
        });
        cupsEntries.forEach(([key], i) => {
          if (cupsResults[i]) next.set(key, cupsResults[i]!.description);
        });
        setCodeDescriptions(next);
      } catch {
        if (!cancelled) setCodeDescriptions(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [encounters, encounterClinicalData]);

  const diagnosisLabel = (encounter: ClinicalEncounterRecord, d: { cie10Code: string }) => {
    const description = codeDescriptions.get(`cie10:${d.cie10Code}:${encounter.occurredAt}`);
    return description ? `${d.cie10Code} — ${description}` : d.cie10Code;
  };

  const serviceLabel = (s: { cupsCode: string; performedAt: string; ripsServiceType: "consultation" | "procedure" | "unknown" }) => {
    const description = codeDescriptions.get(`cups:${s.cupsCode}:${s.performedAt}`);
    const typeLabel = s.ripsServiceType === "consultation" ? "Consulta" : s.ripsServiceType === "procedure" ? "Procedimiento" : "Servicio";
    return description ? `${typeLabel}: ${s.cupsCode} — ${description}` : `${typeLabel}: ${s.cupsCode}`;
  };

  if (encounters.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        El paciente todavía no ha tenido atenciones en la clínica.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface p-4">
      <ol className="flex flex-col gap-4 border-l border-border/70 pl-4">
        {encounters.map((encounter) => {
          const occurredAt = new Date(encounter.occurredAt);
          const attendedByName = encounter.attendedBy ? resolvedByProfileId.get(encounter.attendedBy)?.name : undefined;
          return (
            <li key={encounter.id} className="relative">
              <span
                className="absolute -left-[19px] top-1.5 size-1.5 rounded-full bg-muted-foreground/40 ring-4 ring-surface"
                aria-hidden="true"
              />
              <span className="text-[11px] font-medium text-label-foreground">
                {DATE_FORMATTER.format(occurredAt)} · {TIME_FORMATTER.format(occurredAt)}
              </span>
              <p className="mt-0.5 text-[10px] text-label-foreground">{attendedByName ?? "Sin asignar"}</p>

              <div className="mt-1.5 flex flex-col gap-1">
                {FIELD_LABELS.map(({ key, label }) => {
                  const value = encounter[key] as string | null;
                  if (!value) return null;
                  return (
                    <p key={key} className="text-sm text-foreground/80">
                      <span className="font-medium text-foreground">{label}:</span> {value}
                    </p>
                  );
                })}
                {(() => {
                  const data = encounterClinicalData.get(encounter.id);
                  if (!data || (data.diagnoses.length === 0 && data.services.length === 0)) return null;
                  const principal = data.diagnoses.find((d) => d.role === "principal");
                  const related = data.diagnoses.filter((d) => d.role === "related");
                  return (
                    <>
                      {principal && (
                        <p className="text-sm text-foreground/80">
                          <span className="font-medium text-foreground">Diagnóstico principal:</span>{" "}
                          {diagnosisLabel(encounter, principal)}
                        </p>
                      )}
                      {related.length > 0 && (
                        <p className="text-sm text-foreground/80">
                          <span className="font-medium text-foreground">Diagnósticos relacionados:</span>{" "}
                          {related.map((d) => diagnosisLabel(encounter, d)).join("; ")}
                        </p>
                      )}
                      {data.services.length > 0 && (
                        <p className="text-sm text-foreground/80">
                          <span className="font-medium text-foreground">Servicios realizados:</span>{" "}
                          {data.services.map((s) => serviceLabel(s)).join("; ")}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
