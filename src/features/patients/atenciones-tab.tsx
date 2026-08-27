"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClinicalEncounterRecord } from "./clinical-encounters-data";
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
//   - Every clinical field (motivo, diagnóstico, tratamiento, notas) gets
//     its own inline line instead of the demo's single "treatment" + optional
//     "findings" — same "nothing hidden, nothing truncated" philosophy,
//     applied to the real field set. That inline-everything behavior is
//     itself what satisfies "clear way to view detail" — no separate modal.
const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });

const FIELD_LABELS = [
  { key: "reason", label: "Motivo de consulta" },
  { key: "diagnosis", label: "Diagnóstico / valoración" },
  { key: "treatment", label: "Tratamiento realizado" },
  { key: "notes", label: "Notas clínicas" },
] as const satisfies readonly { key: keyof ClinicalEncounterRecord; label: string }[];

export function AtencionesTab({ clinicId, encounters }: { clinicId: string | null; encounters: ClinicalEncounterRecord[] }) {
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
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
