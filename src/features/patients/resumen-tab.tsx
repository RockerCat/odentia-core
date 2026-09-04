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
import type { Treatment } from "@/features/treatments/data";
import { createClient } from "@/lib/supabase/client";
import { ClinicalInfoCard } from "./clinical-info-card";
import type { ClinicalEncounterRecord } from "./clinical-encounters-data";
import type { ClinicalNoteRecord } from "./clinical-notes-data";
import { ClinicalNotesModal } from "./clinical-notes-modal";
import type { PatientMedicalHistory } from "./medical-history-data";
import { resolveUpdatedByProfessional } from "./resolve-updated-by";
import { ACTIVE_TREATMENT_STATUSES, type TreatmentPlanItem } from "./treatment-plan-data";
import { TreatmentPlanModal } from "./treatment-plan-modal";
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
//   5. Tratamientos activos  → REAL, public.patient_treatment_plan_items
//      (see "PROMPT NINJA — Plan de Tratamiento" and that migration's own
//      comment) — a dedicated, patient-level plan, explicitly distinct
//      from public.treatments (a clinic-wide catalog, no per-patient
//      lifecycle) and from patient_clinical_encounters (past visits, not
//      a standing plan). "Activo" = status planned or in_progress
//      (ACTIVE_TREATMENT_STATUSES) — completed/cancelled items exist but
//      never count here.
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
//   8. Notas clínicas importantes → REAL, public.patient_clinical_notes
//      (see "PROMPT NINJA — Notas clínicas importantes" and that
//      migration's own comment) — a dedicated, patient-level, multi-row
//      entity, explicitly distinct from a specific encounter's own notes
//      (patient_clinical_encounters.notes) and from Antecedentes' general
//      "Observaciones" (patient_medical_histories.observations, already
//      surfaced under its own real label there). Active notes only,
//      most-recently-updated first (same order the fetch already returns).
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
  patientId,
  clinicalNotes,
  treatmentPlanItems,
  treatmentOptions,
  canEditClinicalData,
  onClinicalNotesChanged,
  onTreatmentPlanItemsChanged,
}: {
  history: PatientMedicalHistory | null;
  encounters: ClinicalEncounterRecord[];
  toothFindings: ToothFindingRecord[];
  appointments: Appointment[];
  clinicId: string | null;
  patientId: string;
  clinicalNotes: ClinicalNoteRecord[];
  treatmentPlanItems: TreatmentPlanItem[];
  treatmentOptions: Treatment[];
  canEditClinicalData: boolean;
  onClinicalNotesChanged: (notes: ClinicalNoteRecord[]) => void;
  onTreatmentPlanItemsChanged: (items: TreatmentPlanItem[]) => void;
}) {
  const latestFinding = latestToothFindingUpdate(toothFindings);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showTreatmentPlanModal, setShowTreatmentPlanModal] = useState(false);
  const activeNotes = clinicalNotes.filter((n) => !n.archivedAt);
  const activeTreatments = treatmentPlanItems.filter((item) => ACTIVE_TREATMENT_STATUSES.includes(item.status));

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

      {/* Tratamientos activos — REAL, multi-row, with its own "Ver plan de
          tratamiento" CRUD surface (see treatment-plan-modal.tsx) — same
          reasoning as Notas clínicas importantes below: needs more than
          ClinicalInfoCard's single-string `value`. */}
      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <PlayCircleIcon className="size-4" />
          </span>
          <p className="text-xs text-label-foreground">Tratamientos activos</p>
        </div>
        {activeTreatments.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-foreground">Sin tratamientos activos</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {activeTreatments.slice(0, 3).map((item) => (
              <li key={item.id} className="line-clamp-2 text-sm leading-relaxed break-words text-foreground">
                {item.treatmentName}
              </li>
            ))}
          </ul>
        )}
        {activeTreatments.length > 3 && (
          <p className="mt-1 text-[11px] text-muted-foreground">+{activeTreatments.length - 3} más</p>
        )}
        <button
          type="button"
          onClick={() => setShowTreatmentPlanModal(true)}
          className="mt-2.5 text-xs font-medium text-primary hover:underline"
        >
          Ver plan de tratamiento
        </button>
      </div>

      {showTreatmentPlanModal && (
        <TreatmentPlanModal
          patientId={patientId}
          items={treatmentPlanItems}
          treatmentOptions={treatmentOptions}
          canEdit={canEditClinicalData}
          onClose={() => setShowTreatmentPlanModal(false)}
          onChanged={onTreatmentPlanItemsChanged}
        />
      )}

      <ClinicalInfoCard icon={CalendarIcon} label="Próxima cita" value={nextAppointmentLabelFrom(appointments)} />
      <ClinicalInfoCard icon={ToothIcon} label="Última actualización del odontograma" value={odontogramUpdatedLabel} />

      {/* Notas clínicas importantes — REAL, multi-row, with its own
          "Gestionar notas" CRUD surface (see clinical-notes-modal.tsx) —
          the only Resumen card that needs more than ClinicalInfoCard's
          plain label/value shell, so it gets its own small block instead
          of forcing a list into that component's single-string `value`. */}
      <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <NoteIcon className="size-4" />
          </span>
          <p className="text-xs text-label-foreground">Notas clínicas importantes</p>
        </div>
        {activeNotes.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-foreground">Sin notas clínicas importantes</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {activeNotes.slice(0, 3).map((note) => (
              <li key={note.id} className="line-clamp-2 text-sm leading-relaxed break-words text-foreground">
                {note.content}
              </li>
            ))}
          </ul>
        )}
        {activeNotes.length > 3 && (
          <p className="mt-1 text-[11px] text-muted-foreground">+{activeNotes.length - 3} más</p>
        )}
        <button
          type="button"
          onClick={() => setShowNotesModal(true)}
          className="mt-2.5 text-xs font-medium text-primary hover:underline"
        >
          Gestionar notas
        </button>
      </div>

      {showNotesModal && (
        <ClinicalNotesModal
          patientId={patientId}
          clinicId={clinicId}
          notes={clinicalNotes}
          canEdit={canEditClinicalData}
          onClose={() => setShowNotesModal(false)}
          onChanged={onClinicalNotesChanged}
        />
      )}
    </div>
  );
}
