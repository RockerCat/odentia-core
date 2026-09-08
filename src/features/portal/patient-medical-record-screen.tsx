"use client";

import { useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { AntecedentesTab } from "@/features/patients/antecedentes-tab";
import { AtencionesTab } from "@/features/patients/atenciones-tab";
import { ClinicalAlerts } from "@/features/patients/clinical-alerts";
import type { ClinicalDocumentRecord } from "@/features/patients/clinical-documents-data";
import type { ClinicalEncounterRecord } from "@/features/patients/clinical-encounters-data";
import type { ClinicalNoteRecord } from "@/features/patients/clinical-notes-data";
import type { Patient } from "@/features/patients/data";
import { DocumentosTab } from "@/features/patients/documentos-tab";
import type { PatientMedicalHistory } from "@/features/patients/medical-history-data";
import { OdontogramaTab } from "@/features/patients/odontograma-tab";
import { ResumenTab } from "@/features/patients/resumen-tab";
import type { TreatmentPlanItem } from "@/features/patients/treatment-plan-data";
import type { ToothFindingRecord } from "@/features/patients/tooth-findings-data";
import type { Appointment } from "@/features/dashboard/appointments-data";

// Mi Historia Clínica — the Patient Portal's real, READ-ONLY view of the
// exact same expediente Historia Clínica (staff) reads/writes. Per this
// task's own principle: "NO reconstruir una segunda Historia Clínica" —
// this is a genuinely NEW, Portal-specific outer shell (own identity
// header, own tab bar, no "Volver a Pacientes"/"Descargar PDF" — neither
// belongs in the Portal, see task scope's own NO list), but every TAB BODY
// below is the exact same real component
// patient-clinical-record-screen.tsx already uses for staff
// (AntecedentesTab/OdontogramaTab/AtencionesTab/DocumentosTab/ResumenTab,
// plus ClinicalAlerts) — same data types, same helpers
// (resolve-updated-by.ts, tooth-findings-data.ts's toOdontogramData, …),
// imported straight from src/features/patients/. Editing is impossible
// here, not just hidden: every write affordance in each of those
// components is itself gated behind a `canEdit`/`canUpload` prop (see
// each tab's own file), and this screen always passes `false` — the same
// boolean shape Assistant (staff's own existing read-only clinical role)
// already gets today, so a Patient sees exactly the read-only rendering
// this codebase already ships and tests, not a new code path invented for
// this screen.
//
// Replaces the old fully-mock MedicalRecord (medical-history.tsx's own
// CURRENT_PATIENT/MY_PATIENT_RECORD/WEEK_APPOINTMENTS) — deleted from this
// route entirely, not kept as a fallback.
const TABS = ["Resumen", "Antecedentes", "Odontograma", "Atenciones", "Documentos"] as const;
type Tab = (typeof TABS)[number];

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

function initialsOf(patient: Patient): string {
  return `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase() || "?";
}

function ageOf(patient: Patient): number | null {
  if (!patient.birthDate) return null;
  const birth = new Date(patient.birthDate);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

const PATIENT_SINCE_FORMATTER = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric" });

export function PatientMedicalRecordScreen({
  patient,
  clinicId,
  medicalHistory,
  toothFindings,
  clinicalEncounters,
  clinicalDocuments,
  clinicalNotes,
  treatmentPlanItems,
  appointments,
}: {
  patient: Patient;
  clinicId: string;
  medicalHistory: PatientMedicalHistory | null;
  toothFindings: ToothFindingRecord[];
  clinicalEncounters: ClinicalEncounterRecord[];
  clinicalDocuments: ClinicalDocumentRecord[];
  clinicalNotes: ClinicalNoteRecord[];
  treatmentPlanItems: TreatmentPlanItem[];
  appointments: Appointment[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Resumen");
  const age = ageOf(patient);

  return (
    <div className="flex flex-col gap-5">
      {/* Identity header — same field set/layout as the staff screen's own
          header (edad, documento, estado, paciente desde), minus "Volver a
          Pacientes" (staff-only navigation) and "Descargar PDF" (not built
          for the Portal in this pass — see task scope). No "Odontólogo
          habitual" pill either: same honest reason the staff screen
          already gives — no real patient↔odontólogo relationship exists in
          the schema yet. */}
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar name={fullName(patient)} initials={initialsOf(patient)} sizeClassName="size-14" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{fullName(patient)}</p>
              <p className="truncate text-sm text-muted-foreground">
                {age !== null ? `${age} años · ` : ""}
                {patient.documentId || "Sin documento"}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:flex sm:items-center sm:gap-6">
            <div>
              <dt className="text-xs text-label-foreground">Estado</dt>
              <dd className="mt-0.5">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    patient.active ? "border-primary/25 bg-primary/10 text-primary" : "border-danger/25 bg-danger/10 text-danger"
                  }`}
                >
                  {patient.active ? "Activo" : "Inactivo"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Paciente desde</dt>
              <dd className="mt-0.5 font-medium">{PATIENT_SINCE_FORMATTER.format(new Date(patient.createdAt))}</dd>
            </div>
          </dl>
        </div>
      </div>

      <ClinicalAlerts history={medicalHistory} />

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab ? "border-primary text-primary" : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Every tab below is read-only by construction — see this file's
          own top comment. treatmentOptions is [] and canEditClinicalData/
          canEdit/canUpload are always false: the "Ver plan de
          tratamiento"/"Gestionar notas" modals still open (same as they do
          for a read-only Assistant today), but render nothing but a list —
          their own create/edit/status-change UI is itself gated behind
          that same false flag, never reachable here. */}
      {activeTab === "Resumen" && (
        <ResumenTab
          history={medicalHistory}
          encounters={clinicalEncounters}
          toothFindings={toothFindings}
          appointments={appointments}
          clinicId={clinicId}
          patientId={patient.id}
          clinicalNotes={clinicalNotes}
          treatmentPlanItems={treatmentPlanItems}
          treatmentOptions={[]}
          canEditClinicalData={false}
          onClinicalNotesChanged={() => {}}
          onTreatmentPlanItemsChanged={() => {}}
        />
      )}
      {activeTab === "Antecedentes" && (
        <AntecedentesTab
          patientId={patient.id}
          clinicId={clinicId}
          history={medicalHistory}
          canEdit={false}
          onUpdated={() => {}}
        />
      )}
      {activeTab === "Odontograma" && (
        <OdontogramaTab
          patientId={patient.id}
          patientName={fullName(patient)}
          clinicId={clinicId}
          findings={toothFindings}
          canEdit={false}
          onChanged={() => {}}
        />
      )}
      {activeTab === "Atenciones" && <AtencionesTab clinicId={clinicId} encounters={clinicalEncounters} />}
      {activeTab === "Documentos" && (
        <DocumentosTab
          patientId={patient.id}
          clinicId={clinicId}
          documents={clinicalDocuments}
          canUpload={false}
          onChanged={() => {}}
        />
      )}
    </div>
  );
}
