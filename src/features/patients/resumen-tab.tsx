"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangleIcon,
  CalendarIcon,
  ClipboardIcon,
  ClockIcon,
  FlagIcon,
  NoteIcon,
  PlayCircleIcon,
  ToothIcon,
} from "@/components/shell/icons";
import type { Appointment } from "@/features/dashboard/appointments-data";
import { isTerminalStatus } from "@/features/dashboard/real-status";
import { createClient } from "@/lib/supabase/client";
import { ClinicalInfoCard } from "./clinical-info-card";
import type { ClinicalEncounterRecord } from "./clinical-encounters-data";
import type { PatientMedicalHistory } from "./medical-history-data";
import { resolveUpdatedByProfessional } from "./resolve-updated-by";
import type { ToothFindingRecord } from "./tooth-findings-data";

// Restores the approved demo's Resumen grid (clinical-record-screen.tsx's
// ResumenTab/ClinicalKpiCard) — same 8-card grid, same icons, same labels,
// same layout — fed by real data where it exists and honest empty states
// where it doesn't yet (see CLAUDE.md task scope: preserve the approved
// design, replace mock → real, never a generic placeholder). Reads the
// SAME medicalHistory the Antecedentes tab reads/writes (see
// patient-clinical-record-screen.tsx) — no second fetch, no duplicated
// state, so an edit there shows up here immediately.
//
// Audited card-by-card ("PROMPT NINJA — Auditar y conectar TODO el Resumen
// de Historia Clínica") against Supabase directly:
//   1. Alergias              → REAL, patient_medical_histories.allergies
//   2. Medicamentos actuales → REAL, patient_medical_histories.current_medications
//   3. Condiciones médicas   → REAL, patient_medical_histories.medical_conditions
//   4. Última atención       → REAL/DERIVADO, patient_clinical_encounters
//      (finalized_at IS NOT NULL, occurred_at desc) — [0] via lastVisitLabelFrom
//   5. Tratamientos activos  → NO EXISTE fuente real. public.treatments is a
//      clinic-wide CATALOG of treatment names (Nueva cita's picker), not a
//      per-patient "currently undergoing" record — no patient_id, no
//      active/completed lifecycle. patient_clinical_encounters.treatment is
//      free text per past visit, not a standing course of care. Per this
//      task's own rule ("NO inferir automáticamente de procedimientos
//      realizados... si no existe ese concepto persistido, NO inventar
//      datos"), this stays an honest placeholder until a real entity exists.
//   6. Próxima cita          → REAL/DERIVADO, public.appointments — earliest
//      non-terminal (not completed/no_show/cancelled) row with startsAt in
//      the future, via nextAppointmentLabelFrom. Never derived from
//      encounters (those are always in the past by definition).
//   7. Última actualización del odontograma → REAL/DERIVADO,
//      patient_tooth_findings — latest updated_at across all of the
//      patient's findings (same "latest wins" rule odontograma-tab.tsx
//      already uses on-screen), professional resolved best-effort via
//      resolveUpdatedByProfessional (same helper Antecedentes/Odontograma
//      already use) — date alone if that resolution isn't available.
//   8. Notas clínicas importantes → NO EXISTE fuente real. No column/table
//      represents a curated "important note" distinct from a specific
//      encounter's own notes (patient_clinical_encounters.notes) or
//      Antecedentes' general "Observaciones" (patient_medical_histories.
//      observations, already surfaced under its own real label there).
//      Per this task's own rule ("NO reutilizar arbitrariamente notas de
//      encounters"), relabeling either of those under this card would
//      misrepresent what they mean — stays an honest placeholder.
const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });

// encounters is the SAME array Atenciones/PDF already read
// (fetchPatientClinicalEncounters — finalized_at IS NOT NULL, occurred_at
// desc), so [0] is always the most recent FINALIZED encounter, never a
// draft or a completed-without-encounter appointment (see
// clinical-encounters-data.ts's own comment on why that filter exists) —
// same demo label shape as the approved reference's own
// getPatientVisitSummary ("<fecha>, <hora> · <tipo>").
export function lastVisitLabelFrom(encounters: ClinicalEncounterRecord[]): string {
  const lastVisit = encounters[0];
  if (!lastVisit) return "Sin atenciones registradas";
  const occurredAt = new Date(lastVisit.occurredAt);
  return `${DATE_FORMATTER.format(occurredAt)}, ${TIME_FORMATTER.format(occurredAt)} · ${lastVisit.reason ?? "Consulta"}`;
}

// "Próxima cita" per CLAUDE.md's real Appointment Lifecycle: the earliest
// still-future row that isn't already closed for good (completed/no_show/
// cancelled) — an in_progress or unresolved one is never "próxima" (it has
// already started), and a past one obviously isn't either. Never derived
// from encounters, which only ever represent something that already
// happened.
export function nextAppointmentLabelFrom(appointments: Appointment[], now: Date = new Date()): string {
  const upcoming = appointments
    .filter((a) => !isTerminalStatus(a.status) && new Date(a.startsAt).getTime() > now.getTime())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const next = upcoming[0];
  if (!next) return "Sin cita programada";
  const startsAt = new Date(next.startsAt);
  return `${DATE_FORMATTER.format(startsAt)}, ${TIME_FORMATTER.format(startsAt)} · ${next.reason ?? "Consulta"}`;
}

// The single most-recently-updated finding across the whole odontogram —
// same rule odontograma-tab.tsx and the PDF builder already use on-screen
// ("Actualizado <fecha> · <odontólogo>"), reproduced here (not imported —
// that's a different tab's own local function) so this card never shows
// "Sin odontograma registrado" once at least one real finding exists.
export function latestToothFindingUpdate(findings: ToothFindingRecord[]): ToothFindingRecord | null {
  return findings.reduce<ToothFindingRecord | null>(
    (latest, f) => (!latest || f.updatedAt > latest.updatedAt ? f : latest),
    null,
  );
}

export function ResumenTab({
  history,
  encounters,
  toothFindings,
  appointments,
  clinicId,
}: {
  history: PatientMedicalHistory | null;
  encounters: ClinicalEncounterRecord[];
  toothFindings: ToothFindingRecord[];
  appointments: Appointment[];
  clinicId: string | null;
}) {
  const latestFinding = latestToothFindingUpdate(toothFindings);

  // Best-effort professional name for the odontogram card — same pattern
  // as AtencionesTab/OdontogramaTab's own resolvedByProfileId: never blocks
  // or fabricates the date itself, just adds "· <nombre>" once resolved.
  const [odontogramProfessionalName, setOdontogramProfessionalName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clinicId || !latestFinding?.recordedBy) {
        if (!cancelled) setOdontogramProfessionalName(null);
        return;
      }
      try {
        const supabase = createClient();
        const resolved = await resolveUpdatedByProfessional(supabase, clinicId, latestFinding.recordedBy);
        if (!cancelled) setOdontogramProfessionalName(resolved?.name ?? null);
      } catch {
        if (!cancelled) setOdontogramProfessionalName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, latestFinding?.recordedBy]);

  const odontogramUpdatedLabel = latestFinding
    ? `Actualizado ${DATE_FORMATTER.format(new Date(latestFinding.updatedAt))}${odontogramProfessionalName ? ` · ${odontogramProfessionalName}` : ""}`
    : "Sin odontograma registrado";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ClinicalInfoCard icon={AlertTriangleIcon} label="Alergias" value={history?.allergies ?? "Sin registrar"} />
      <ClinicalInfoCard
        icon={ClipboardIcon}
        label="Medicamentos actuales"
        value={history?.currentMedications ?? "Sin registrar"}
      />
      <ClinicalInfoCard
        icon={FlagIcon}
        label="Condiciones médicas relevantes"
        value={history?.medicalConditions ?? "Sin registrar"}
      />
      <ClinicalInfoCard icon={ClockIcon} label="Última atención" value={lastVisitLabelFrom(encounters)} />
      {/* Tratamientos activos / Notas clínicas importantes: no persisted
          entity represents either concept yet — see this file's own top
          comment (cards 5 and 8) for what was actually audited. Honest
          empty states, never inferred/inventado (see CLAUDE.md task
          scope). */}
      <ClinicalInfoCard icon={PlayCircleIcon} label="Tratamientos activos" value="Ninguno registrado" />
      <ClinicalInfoCard icon={CalendarIcon} label="Próxima cita" value={nextAppointmentLabelFrom(appointments)} />
      <ClinicalInfoCard icon={ToothIcon} label="Última actualización del odontograma" value={odontogramUpdatedLabel} />
      <ClinicalInfoCard icon={NoteIcon} label="Notas clínicas importantes" value="No registradas" relaxedLeading />
    </div>
  );
}
