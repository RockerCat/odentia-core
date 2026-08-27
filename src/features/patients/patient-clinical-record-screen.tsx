"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronIcon, DownloadIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { fetchTeamMembers } from "@/features/clinic/data";
import { createClient } from "@/lib/supabase/client";
import { AntecedentesTab } from "./antecedentes-tab";
import { AtencionesTab } from "./atenciones-tab";
import { ClinicalAlerts } from "./clinical-alerts";
import type { ClinicalDocumentRecord } from "./clinical-documents-data";
import type { ClinicalEncounterRecord } from "./clinical-encounters-data";
import type { Patient } from "./data";
import { DocumentosTab } from "./documentos-tab";
import type { PatientMedicalHistory } from "./medical-history-data";
import { OdontogramaTab } from "./odontograma-tab";
import type { ProfessionalDirectory } from "./pdf/real-clinical-record-data";
import { ResumenTab } from "./resumen-tab";
import type { ToothFindingRecord } from "./tooth-findings-data";

// Real Historia Clínica shell — deliberately a SEPARATE component from
// clinical-record-screen.tsx (not a shared/refactored one, same reasoning
// as PatientRecordModal vs. patient-detail-modal.tsx): that file is the
// approved demo/mock reference this restores layout from, untouched.
// Resumen, Antecedentes, Odontograma, Atenciones and Documentos are now
// real: Resumen/Antecedentes read the SAME medicalHistory state
// (public.patient_medical_histories) — no second fetch, no duplicated
// state, so editing Antecedentes updates Resumen and the Alertas Clínicas
// block immediately. Odontograma reads public.patient_tooth_findings (one
// row per finding). Atenciones reads public.patient_clinical_encounters
// (one row per encounter) — read-only here: the approved demo's own
// Atenciones tab has no "register" action, encounters are only ever
// created by completing an appointment in Agenda, which is still fully
// mock (see CLAUDE.md task scope — no second creation flow invented).
// Documentos reads public.patient_clinical_documents, with real
// upload/preview/download against the private "clinical-documents"
// Storage bucket. Real patient identity in the header; "Descargar PDF"
// now generates a real PDF (see pdf/real-clinical-record-document.tsx)
// from these same real rows — no more mock content, no more disabled
// state.
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

export function PatientClinicalRecordScreen({
  patient,
  clinicId,
  clinicName,
  clinicLogoUrl,
  medicalHistory: initialMedicalHistory,
  toothFindings: initialToothFindings,
  clinicalEncounters,
  clinicalDocuments: initialClinicalDocuments,
  canEditClinicalData,
}: {
  patient: Patient;
  clinicId: string | null;
  clinicName: string;
  clinicLogoUrl: string | null;
  medicalHistory: PatientMedicalHistory | null;
  toothFindings: ToothFindingRecord[];
  clinicalEncounters: ClinicalEncounterRecord[];
  clinicalDocuments: ClinicalDocumentRecord[];
  canEditClinicalData: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Resumen");
  const [medicalHistory, setMedicalHistory] = useState(initialMedicalHistory);
  const [toothFindings, setToothFindings] = useState(initialToothFindings);
  const [clinicalDocuments, setClinicalDocuments] = useState(initialClinicalDocuments);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const age = ageOf(patient);

  // Real PDF export — cero mocks: reuses the exact same rows this screen
  // already holds (medicalHistory/toothFindings/clinicalEncounters/
  // clinicalDocuments), plus one fetchTeamMembers() call to resolve every
  // profileId (updated_by/recorded_by/attended_by/uploaded_by) referenced
  // across them into a display name — same pattern as
  // resolveUpdatedByProfessional, just batched once instead of per-tab.
  // @react-pdf/renderer + the document module are dynamically imported so
  // neither lands in this screen's initial bundle (same convention as the
  // approved mock reference's own handleDownloadPdf).
  const handleDownloadPdf = async () => {
    if (!clinicId) return;
    setDownloadingPdf(true);
    try {
      const [{ pdf }, { RealClinicalRecordDocument, getRealClinicalRecordPdfFilename }, { buildRealClinicalRecordPdfData }] =
        await Promise.all([
          import("@react-pdf/renderer"),
          import("./pdf/real-clinical-record-document"),
          import("./pdf/real-clinical-record-data"),
        ]);

      const supabase = createClient();
      const members = await fetchTeamMembers(supabase, clinicId);
      const professionals: ProfessionalDirectory = new Map(
        members.map((m) => [
          m.profileId,
          { name: `${m.firstName} ${m.lastName}`.trim(), specialtyName: m.professionalProfile?.specialtyName ?? null },
        ]),
      );

      const data = buildRealClinicalRecordPdfData({
        patient,
        medicalHistory,
        toothFindings,
        clinicalEncounters,
        clinicalDocuments,
        professionals,
      });

      const logoUrl = clinicLogoUrl ? new URL(clinicLogoUrl, window.location.origin).toString() : undefined;
      const blob = await pdf(<RealClinicalRecordDocument data={data} clinicName={clinicName} clinicLogoUrl={logoUrl} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getRealClinicalRecordPdfFilename(data.patientFullName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header compacto del paciente — solo datos reales. */}
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/pacientes"
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground"
          >
            <ChevronIcon className="size-3.5" />
            Volver a Pacientes
          </Link>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || !clinicId}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DownloadIcon className="size-3.5" />
            {downloadingPdf ? "Generando…" : "Descargar PDF"}
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
              {/* No existe todavía una relación real paciente↔odontólogo
                  en el schema (patients no tiene columna de asignación, ni
                  hay tabla de vínculo — ver CLAUDE.md Domain Model:
                  pacientes pertenecen a la Clínica, no a un Odontólogo) —
                  por eso siempre cae en el estado "Aún sin odontólogo",
                  nunca un valor inventado. Mismo dt/dd/spacing que el
                  diseño aprobado (clinical-record-screen.tsx), listo para
                  mostrar el profesional real en cuanto exista esa
                  relación. */}
              <dt className="text-xs text-label-foreground">Odontólogo habitual</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="font-medium text-foreground">Aún sin odontólogo</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Paciente desde</dt>
              <dd className="mt-0.5 font-medium">{PATIENT_SINCE_FORMATTER.format(new Date(patient.createdAt))}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Alertas clínicas — restaurada del diseño aprobado (ver
          clinical-record-screen.tsx), alimentada por la misma ficha real
          de antecedentes que el tab Antecedentes lee/escribe. Nunca
          fabricada: si los tres campos están vacíos, no se muestra una
          alerta falsa. Componente compartido con el modal de Pacientes
          (ver clinical-alerts.tsx) — misma lógica, sin duplicar. */}
      <ClinicalAlerts history={medicalHistory} />

      {/* Tabs — misma navegación visual aprobada; cada una es un empty
          state honesto, ninguna tabla clínica existe todavía. */}
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

      {activeTab === "Resumen" && <ResumenTab history={medicalHistory} />}
      {activeTab === "Antecedentes" && (
        <AntecedentesTab
          patientId={patient.id}
          clinicId={clinicId}
          history={medicalHistory}
          canEdit={canEditClinicalData}
          onUpdated={setMedicalHistory}
        />
      )}
      {activeTab === "Odontograma" && (
        <OdontogramaTab
          patientId={patient.id}
          patientName={fullName(patient)}
          clinicId={clinicId}
          findings={toothFindings}
          canEdit={canEditClinicalData}
          onChanged={setToothFindings}
        />
      )}
      {activeTab === "Atenciones" && <AtencionesTab clinicId={clinicId} encounters={clinicalEncounters} />}
      {activeTab === "Documentos" && (
        <DocumentosTab
          patientId={patient.id}
          clinicId={clinicId}
          documents={clinicalDocuments}
          canUpload={canEditClinicalData}
          onChanged={setClinicalDocuments}
        />
      )}
    </div>
  );
}
