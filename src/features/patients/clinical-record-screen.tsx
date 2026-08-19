"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  BuildingIcon,
  CalendarIcon,
  ChevronIcon,
  ClipboardIcon,
  ClockIcon,
  CloseIcon,
  DownloadIcon,
  FlagIcon,
  ListIcon,
  NoteIcon,
  PlayCircleIcon,
  ToothIcon,
  UserIcon,
  UsersIcon,
} from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import { useRole } from "@/dev/role-context"; // DEV TOOL — see src/dev/role.ts
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import {
  DENTISTS,
  HISTORY_STATUS_BADGE_CLASS,
  STATUS_LABELS,
  WEEK_APPOINTMENTS,
  WEEK_DAYS,
} from "@/features/dashboard/mock-data";
import { OdontogramPreview, type FindingType } from "@/features/dashboard/odontogram-teeth";
import { CURRENT_USER } from "@/lib/current-user";
import {
  CLINICAL_DOCUMENT_KIND_LABELS,
  getPatientVisitSummary,
  PATIENT_STATUS_LABELS,
  type Anamnesis,
  type OdontogramFindingMeta,
  type Patient,
} from "./mock-data";

// Clinic Admin, Dentist and Assistant all reach this screen (see
// allowedRoles on the route's page.tsx) — Assistant read-only, since
// canEditAntecedentes below only ever allows Dentist. Patient will
// eventually see its own scoped variant through that same allowedRoles
// mechanism; nothing here hardcodes "only these roles can ever see this"
// beyond the route gate itself, so extending access later doesn't require
// rebuilding this component — just adding roles to the gate and, when
// needed, branching what's rendered/editable.
const TABS = ["Resumen", "Antecedentes", "Odontograma", "Atenciones", "Documentos"] as const;
type Tab = (typeof TABS)[number];

const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Mock "fecha/hora" stamp for an antecedentes edit — real wall-clock time
// since this is an in-session, non-persisted edit (see handleSaveAntecedentes),
// formatted to match the rest of the app's "D Mmm YYYY" date labels. Exported
// so the PDF export (pdf/clinical-record-document.tsx) stamps its own
// "generado el" timestamp in the exact same format instead of a second one.
export function formatUpdatedNowLabel(): string {
  const now = new Date();
  const dateLabel = `${now.getDate()} ${MONTH_ABBR[now.getMonth()]} ${now.getFullYear()}`;
  const hours24 = now.getHours();
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${dateLabel}, ${hours12}:${minutes} ${period}`;
}

export function ClinicalRecordScreen({ patient }: { patient: Patient }) {
  // DEV TOOL — see src/dev/role.ts. Editing Antecedentes is Odontólogo-only
  // (see task scope); every other role — including this screen's only
  // currently-reachable one, Clinic Admin — can read but never edit.
  const { role, dentistId } = useRole();
  const canEditAntecedentes = role === "dentist";

  const [activeTab, setActiveTab] = useState<Tab>("Resumen");
  const [showEditAntecedentes, setShowEditAntecedentes] = useState(false);

  // Local, in-session copies of exactly the fields the Antecedentes edit
  // modal can touch — mock-only "persistence" (no backend this stage), but
  // shared between Resumen and Antecedentes (via effectivePatient below)
  // so a save is reflected consistently in both instead of one going
  // stale. Everything else keeps reading straight from `patient`.
  const [allergies, setAllergies] = useState(patient.allergies);
  const [medications, setMedications] = useState(patient.medications);
  const [conditions, setConditions] = useState(patient.conditions);
  const [anamnesis, setAnamnesis] = useState(patient.anamnesis);

  const effectivePatient: Patient = { ...patient, allergies, medications, conditions, anamnesis };

  const dentist = DENTISTS.find((d) => d.id === patient.usualDentistId);
  const { lastVisitLabel, nextAppointmentLabel } = getPatientVisitSummary(
    effectivePatient,
    WEEK_APPOINTMENTS,
    WEEK_DAYS,
  );

  // Point 10: alertas derived straight from the same allergies/conditions/
  // medications the edit modal can change — never a separate, driftable copy.
  const hasAlerts = Boolean(allergies || conditions?.length || medications?.length);

  const handleSaveAntecedentes = (edited: {
    allergies?: string;
    medications?: string[];
    conditions?: string[];
    personalHistory?: string;
    familyHistory?: string;
    habits?: string;
    surgicalHistory?: string;
    otherRelevant?: string;
    oralHygieneSummary?: string;
  }) => {
    setAllergies(edited.allergies);
    setMedications(edited.medications);
    setConditions(edited.conditions);
    setAnamnesis({
      ...anamnesis,
      personalHistory: edited.personalHistory,
      familyHistory: edited.familyHistory,
      habits: edited.habits,
      surgicalHistory: edited.surgicalHistory,
      otherRelevant: edited.otherRelevant,
      oralHygieneSummary: edited.oralHygieneSummary,
      updatedLabel: formatUpdatedNowLabel(),
      updatedByDentistId: dentistId,
    });
    setShowEditAntecedentes(false);
  };

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Available to every role that can reach this screen (see allowedRoles on
  // the route's page.tsx) — downloading is a read action, never an edit
  // capability, so it needs no role check of its own beyond that gate.
  // @react-pdf/renderer is dynamically imported so it never lands in this
  // screen's initial bundle for the common case of someone who never clicks
  // this button.
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const [{ pdf }, { ClinicalRecordDocument, getClinicalRecordPdfFilename }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./pdf/clinical-record-document"),
      ]);
      const logoUrl = CURRENT_USER.clinicLogoUrl
        ? new URL(CURRENT_USER.clinicLogoUrl, window.location.origin).toString()
        : undefined;
      const blob = await pdf(
        <ClinicalRecordDocument
          patient={effectivePatient}
          clinicName={CURRENT_USER.clinicName}
          clinicLogoUrl={logoUrl}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getClinicalRecordPdfFilename(effectivePatient);
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
      {/* Header compacto del paciente */}
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
            disabled={downloadingPdf}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DownloadIcon className="size-3.5" />
            {downloadingPdf ? "Generando…" : "Descargar PDF"}
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              name={patient.name}
              initials={patient.initials}
              avatar_url={patient.avatar_url}
              sizeClassName="size-14"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{patient.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {patient.age} años · {patient.documentId}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:flex sm:items-center sm:gap-6">
            <div>
              <dt className="text-xs text-label-foreground">Estado</dt>
              <dd className="mt-0.5">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    patient.status === "active"
                      ? "border-primary/25 bg-primary/10 text-primary"
                      : "border-danger/25 bg-danger/10 text-danger"
                  }`}
                >
                  {PATIENT_STATUS_LABELS[patient.status]}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Odontólogo habitual</dt>
              {/* Same professional identity pattern used everywhere else in
                  Odentia (avatar + nombre + especialidad), not plain text. */}
              <dd className="mt-1 flex items-center gap-2">
                {dentist ? (
                  <>
                    <UserAvatar
                      name={dentist.name}
                      initials={dentist.initials}
                      avatar_url={dentist.avatar_url}
                      sizeClassName="size-7"
                    />
                    <span className="font-medium text-foreground">
                      {dentist.name} <span className="font-normal text-muted-foreground">· {dentist.specialty}</span>
                    </span>
                  </>
                ) : (
                  <span className="font-medium text-foreground">Sin asignar</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-label-foreground">Paciente desde</dt>
              <dd className="mt-0.5 font-medium">{patient.patientSinceLabel}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Alertas clínicas — must be impossible to miss, so it's its own
          zone right below the header, not folded into Resumen. */}
      {hasAlerts ? (
        <div className="rounded-xl border border-danger/25 bg-danger/5 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-danger uppercase">
            <AlertTriangleIcon className="size-3.5" />
            Alertas clínicas
          </p>
          <dl className="mt-2 flex flex-col gap-1.5 text-sm">
            {allergies && (
              <div className="flex flex-wrap items-baseline gap-1.5">
                <dt className="shrink-0 text-xs font-semibold text-danger">Alergias:</dt>
                <dd className="text-danger">{allergies}</dd>
              </div>
            )}
            {conditions && conditions.length > 0 && (
              <div className="flex flex-wrap items-baseline gap-1.5">
                <dt className="shrink-0 text-xs font-semibold text-danger">Condiciones:</dt>
                <dd className="text-danger">{conditions.join(", ")}</dd>
              </div>
            )}
            {medications && medications.length > 0 && (
              <div className="flex flex-wrap items-baseline gap-1.5">
                <dt className="shrink-0 text-xs font-semibold text-danger">Medicamentos:</dt>
                <dd className="text-danger">{medications.join(", ")}</dd>
              </div>
            )}
          </dl>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted-foreground">
          Sin alertas clínicas registradas
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Resumen" && (
        <ResumenTab
          patient={effectivePatient}
          lastVisitLabel={lastVisitLabel}
          nextAppointmentLabel={nextAppointmentLabel}
        />
      )}
      {activeTab === "Antecedentes" && (
        <AntecedentesTab
          patient={effectivePatient}
          canEdit={canEditAntecedentes}
          onRequestEdit={() => setShowEditAntecedentes(true)}
        />
      )}
      {activeTab === "Odontograma" && <OdontogramaTab patient={patient} />}
      {activeTab === "Atenciones" && <AtencionesTab patient={patient} />}
      {activeTab === "Documentos" && <DocumentosTab patient={patient} />}

      {showEditAntecedentes && (
        <EditAntecedentesModal
          allergies={allergies}
          medications={medications}
          conditions={conditions}
          anamnesis={anamnesis}
          onClose={() => setShowEditAntecedentes(false)}
          onSave={handleSaveAntecedentes}
        />
      )}
    </div>
  );
}

// A quick clinical snapshot, not a form — every field is read-only,
// compact, and just states the current value (or its empty state).
function ResumenTab({
  patient,
  lastVisitLabel,
  nextAppointmentLabel,
}: {
  patient: Patient;
  lastVisitLabel: string;
  nextAppointmentLabel: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ClinicalKpiCard icon={AlertTriangleIcon} label="Alergias" value={patient.allergies ?? "Sin registrar"} />
      <ClinicalKpiCard
        icon={ClipboardIcon}
        label="Medicamentos actuales"
        value={patient.medications?.join(", ") || "Sin registrar"}
      />
      <ClinicalKpiCard
        icon={FlagIcon}
        label="Condiciones médicas relevantes"
        value={patient.conditions?.join(", ") || "Sin registrar"}
      />
      <ClinicalKpiCard icon={ClockIcon} label="Última atención" value={lastVisitLabel} />
      <ClinicalKpiCard
        icon={PlayCircleIcon}
        label="Tratamientos activos"
        value={patient.activeTreatments?.join(", ") || "Ninguno registrado"}
      />
      <ClinicalKpiCard icon={CalendarIcon} label="Próxima cita" value={nextAppointmentLabel} />
      <ClinicalKpiCard
        icon={ToothIcon}
        label="Última actualización del odontograma"
        value={patient.odontogramUpdatedLabel ?? "Sin registrar"}
      />
      <ClinicalKpiCard
        icon={NoteIcon}
        label="Notas clínicas importantes"
        value={patient.clinicalNotes ?? "Sin notas registradas"}
        relaxedLeading
      />
    </div>
  );
}

// KPI/card language adapted to clinical text, not numbers: small secondary
// label (with the icon Odentia already uses for this — teal circle,
// bg-primary/10 text-primary, same as e.g. patients-screen.tsx's KpiCard)
// over the actually-legible content. Strict grid, no spans: every card is
// exactly one cell, always — long content only grows the card's own
// height, never its width; CSS Grid's default row stretch already equals
// every card in a row to the tallest one automatically. This is the
// Resumen tab's own card — deliberately its own component, not shared with
// any other tab, so changes here never ripple elsewhere.
function ClinicalKpiCard({
  icon: Icon,
  label,
  value,
  // Only "Notas clínicas importantes" sets this — a preventive readability
  // bump for whatever a dentist writes there, which tends to run longer
  // than every other field here. Every other card keeps its current
  // (already-correct: no fixed height/line-clamp/overflow, wraps and grows
  // naturally, grid stretch already equalizes row heights) rendering
  // completely unchanged.
  relaxedLeading,
}: {
  icon: typeof AlertTriangleIcon;
  label: string;
  value: string;
  relaxedLeading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <p className="text-xs text-label-foreground">{label}</p>
      </div>
      <p
        className={`mt-2 text-sm font-medium break-words text-foreground ${relaxedLeading ? "leading-relaxed" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

// Scannable blocks instead of long paragraphs: "Anamnesis" (icon+label+
// content cards, strict 3/2/1 columns, grows in height only — same
// reasoning as ClinicalKpiCard in the Resumen tab, just its own local
// component so Resumen never has to change for this tab's needs) for the
// fuller detail, then "Condiciones y factores relevantes" below with short
// KPI-style summaries of the same underlying facts (see Anamnesis's
// *Summary fields in mock-data.ts) — deliberately different wording from
// the Anamnesis blocks above, never the same paragraph twice.
function AntecedentesTab({
  patient,
  canEdit,
  onRequestEdit,
}: {
  patient: Patient;
  canEdit: boolean;
  onRequestEdit: () => void;
}) {
  const anamnesis = patient.anamnesis;
  const updatedByDentist = anamnesis ? DENTISTS.find((d) => d.id === anamnesis.updatedByDentistId) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Anamnesis</p>
            {anamnesis ? (
              <div className="mt-1 flex items-center gap-1.5">
                {updatedByDentist && (
                  <UserAvatar
                    name={updatedByDentist.name}
                    initials={updatedByDentist.initials}
                    avatar_url={updatedByDentist.avatar_url}
                    sizeClassName="size-5"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Actualizado {anamnesis.updatedLabel}
                  {updatedByDentist && ` · ${updatedByDentist.name} · ${updatedByDentist.specialty}`}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Sin actualizaciones registradas</p>
            )}
          </div>
          {/* Odontólogo-only (see ClinicalRecordScreen's canEditAntecedentes)
              — Clinic Admin, Asistente y Paciente pueden consultar pero
              nunca ven este botón. Discreto y, por ahora, solo visual: sin
              backend detrás todavía. */}
          {canEdit && (
            <button
              type="button"
              onClick={onRequestEdit}
              className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
            >
              Actualizar antecedentes
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnamnesisBlock
            icon={UserIcon}
            label="Antecedentes personales"
            value={anamnesis?.personalHistory ?? "Sin registrar"}
          />
          <AnamnesisBlock
            icon={UsersIcon}
            label="Antecedentes familiares"
            value={anamnesis?.familyHistory ?? "Sin registrar"}
          />
          <AnamnesisBlock icon={ListIcon} label="Hábitos" value={anamnesis?.habits ?? "Sin registrar"} />
          <AnamnesisBlock
            icon={BuildingIcon}
            label="Cirugías / hospitalizaciones"
            value={anamnesis?.surgicalHistory ?? "Sin registrar"}
          />
          {/* Solo si aplica — no se fuerza un valor para pacientes sin
              embarazo registrado. */}
          {anamnesis?.pregnancy && <AnamnesisBlock icon={FlagIcon} label="Embarazo" value={anamnesis.pregnancy} />}
          <AnamnesisBlock
            icon={NoteIcon}
            label="Otros antecedentes relevantes"
            value={anamnesis?.otherRelevant ?? "Sin registrar"}
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold">Condiciones y factores relevantes</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnamnesisBlock icon={AlertTriangleIcon} label="Alergias" value={patient.allergies ?? "Sin registrar"} />
          <AnamnesisBlock
            icon={ClipboardIcon}
            label="Medicamentos actuales"
            value={patient.medications?.join(", ") || "Sin registrar"}
          />
          <AnamnesisBlock
            icon={FlagIcon}
            label="Condiciones médicas"
            value={patient.conditions?.join(", ") || "Sin registrar"}
          />
          <AnamnesisBlock icon={ListIcon} label="Hábitos" value={anamnesis?.habitsSummary ?? "Sin registrar"} />
          <AnamnesisBlock
            icon={ToothIcon}
            label="Higiene oral"
            value={anamnesis?.oralHygieneSummary ?? "Sin registrar"}
          />
          <AnamnesisBlock
            icon={UsersIcon}
            label="Antecedentes familiares relevantes"
            value={anamnesis?.familyHistorySummary ?? "Sin registrar"}
          />
        </div>
      </div>
    </div>
  );
}

function AnamnesisBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof AlertTriangleIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <p className="text-xs text-label-foreground">{label}</p>
      </div>
      <p className="mt-2 text-sm font-medium break-words text-foreground">{value}</p>
    </div>
  );
}

type AntecedentesEdits = {
  allergies?: string;
  medications?: string[];
  conditions?: string[];
  personalHistory?: string;
  familyHistory?: string;
  habits?: string;
  surgicalHistory?: string;
  otherRelevant?: string;
  oralHygieneSummary?: string;
};

// Odontólogo-only edit surface (see canEditAntecedentes/onRequestEdit in
// ClinicalRecordScreen) — a modal, never a navigation. MVP on purpose:
// simple text/textarea fields, comma-separated lists for
// medicamentos/condiciones instead of a real repeatable-item builder.
function EditAntecedentesModal({
  allergies,
  medications,
  conditions,
  anamnesis,
  onClose,
  onSave,
}: {
  allergies?: string;
  medications?: string[];
  conditions?: string[];
  anamnesis?: Anamnesis;
  onClose: () => void;
  onSave: (edits: AntecedentesEdits) => void;
}) {
  const [allergiesDraft, setAllergiesDraft] = useState(allergies ?? "");
  const [medicationsDraft, setMedicationsDraft] = useState(medications?.join(", ") ?? "");
  const [conditionsDraft, setConditionsDraft] = useState(conditions?.join(", ") ?? "");
  const [personalDraft, setPersonalDraft] = useState(anamnesis?.personalHistory ?? "");
  const [familyDraft, setFamilyDraft] = useState(anamnesis?.familyHistory ?? "");
  const [habitsDraft, setHabitsDraft] = useState(anamnesis?.habits ?? "");
  const [surgicalDraft, setSurgicalDraft] = useState(anamnesis?.surgicalHistory ?? "");
  const [otherDraft, setOtherDraft] = useState(anamnesis?.otherRelevant ?? "");
  const [oralHygieneDraft, setOralHygieneDraft] = useState(anamnesis?.oralHygieneSummary ?? "");

  const splitList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const handleSubmit = () => {
    onSave({
      allergies: allergiesDraft.trim() || undefined,
      medications: medicationsDraft.trim() ? splitList(medicationsDraft) : undefined,
      conditions: conditionsDraft.trim() ? splitList(conditionsDraft) : undefined,
      personalHistory: personalDraft.trim() || undefined,
      familyHistory: familyDraft.trim() || undefined,
      habits: habitsDraft.trim() || undefined,
      surgicalHistory: surgicalDraft.trim() || undefined,
      otherRelevant: otherDraft.trim() || undefined,
      oralHygieneSummary: oralHygieneDraft.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Actualizar antecedentes"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Actualizar antecedentes</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-foreground/5"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3">
            <EditField label="Antecedentes personales">
              <textarea
                value={personalDraft}
                onChange={(e) => setPersonalDraft(e.target.value)}
                rows={2}
                className={`${FIELD_CLASS} resize-none`}
              />
            </EditField>
            <EditField label="Antecedentes familiares">
              <textarea
                value={familyDraft}
                onChange={(e) => setFamilyDraft(e.target.value)}
                rows={2}
                className={`${FIELD_CLASS} resize-none`}
              />
            </EditField>
            <EditField label="Hábitos">
              <textarea
                value={habitsDraft}
                onChange={(e) => setHabitsDraft(e.target.value)}
                rows={2}
                className={`${FIELD_CLASS} resize-none`}
              />
            </EditField>
            <EditField label="Cirugías / hospitalizaciones">
              <textarea
                value={surgicalDraft}
                onChange={(e) => setSurgicalDraft(e.target.value)}
                rows={2}
                className={`${FIELD_CLASS} resize-none`}
              />
            </EditField>
            <EditField label="Otros antecedentes relevantes">
              <textarea
                value={otherDraft}
                onChange={(e) => setOtherDraft(e.target.value)}
                rows={2}
                className={`${FIELD_CLASS} resize-none`}
              />
            </EditField>
            <EditField label="Alergias">
              <input value={allergiesDraft} onChange={(e) => setAllergiesDraft(e.target.value)} className={FIELD_CLASS} />
            </EditField>
            <EditField label="Medicamentos actuales (separados por coma)">
              <input
                value={medicationsDraft}
                onChange={(e) => setMedicationsDraft(e.target.value)}
                className={FIELD_CLASS}
              />
            </EditField>
            <EditField label="Condiciones médicas (separadas por coma)">
              <input
                value={conditionsDraft}
                onChange={(e) => setConditionsDraft(e.target.value)}
                className={FIELD_CLASS}
              />
            </EditField>
            <EditField label="Higiene oral">
              <input
                value={oralHygieneDraft}
                onChange={(e) => setOralHygieneDraft(e.target.value)}
                className={FIELD_CLASS}
              />
            </EditField>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-foreground/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

// Exported so the Historia Clínica PDF (pdf/clinical-record-document.tsx)
// reuses the exact same finding-type labels/order instead of a second copy.
export const FINDING_LEGEND: { type: FindingType; label: string; dotClass: string }[] = [
  { type: "caries", label: "Caries", dotClass: "bg-danger" },
  { type: "restauracion", label: "Restauración", dotClass: "bg-info" },
  { type: "ausente", label: "Ausente", dotClass: "bg-muted-foreground" },
  { type: "otro", label: "Otro", dotClass: "bg-warning" },
];

function dotClassForType(type: FindingType): string {
  return FINDING_LEGEND.find((entry) => entry.type === type)?.dotClass ?? "bg-muted-foreground";
}

export function labelForType(type: FindingType): string {
  return FINDING_LEGEND.find((entry) => entry.type === type)?.label ?? "Otro";
}

// Reuses the exact same tooth chart the clinical encounter flow already
// draws (see OdontogramPreview, odontogram-teeth.tsx) — read-only here,
// no "abrir odontograma" editor at this stage (see task scope). Desktop:
// 75/25 split, odontograma left / Hallazgos panel right. Mobile: the same
// grid collapses to one column, odontograma first — no forced 75/25.
// One row per pieza, same as what's actually colored on the chart (the
// latest finding per tooth — see OdontogramPreview's own logic). Exported
// (not just inlined in OdontogramaTab below) so the Historia Clínica PDF
// (see pdf/clinical-record-document.tsx) reuses this exact derivation
// instead of a second copy of the same "latest finding per tooth" logic.
export function getOdontogramFindingRows(patient: Patient) {
  const odontogram = patient.odontogramData ?? {};
  const findingsMeta = patient.odontogramFindingsMeta ?? [];
  return Object.entries(odontogram)
    .map(([fdi, findings]) => {
      const latest = findings[findings.length - 1];
      if (!latest) return null;
      const meta: OdontogramFindingMeta | undefined = findingsMeta.find((m) => m.findingId === latest.id);
      const dentist = meta ? DENTISTS.find((d) => d.id === meta.dentistId) : undefined;
      return {
        fdi: Number(fdi),
        type: latest.type,
        note: latest.note,
        dateLabel: meta?.dateLabel ?? "Sin registrar",
        dentistName: dentist?.name ?? "Sin registrar",
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.fdi - b.fdi);
}

function OdontogramaTab({ patient }: { patient: Patient }) {
  const odontogram = patient.odontogramData ?? {};
  const findingCount = Object.keys(odontogram).length;
  // Keeps the panel's count exactly matching "N pieza(s) con hallazgos".
  const findingRows = getOdontogramFindingRows(patient);

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Odontograma</p>
        <p className="text-xs text-muted-foreground">
          Última actualización: {patient.odontogramUpdatedLabel ?? "Sin registrar"}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_1fr]">
        {/* Izquierda (75% en desktop) — numeración dental, estados
            visuales y leyenda, sin cambios de lógica/colores. */}
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

        {/* Derecha (25% en desktop) — un renglón por hallazgo, mismos
            mocks que ya colorean el odontograma a la izquierda. */}
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold text-foreground">Hallazgos</p>
          {findingRows.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Sin hallazgos registrados.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2.5">
              {findingRows.map((row) => (
                <li key={row.fdi} className="rounded-lg border border-border/70 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`size-2 shrink-0 rounded-full ${dotClassForType(row.type)}`} aria-hidden="true" />
                    <p className="text-xs font-semibold text-foreground">
                      Pieza {row.fdi} · {labelForType(row.type)}
                    </p>
                  </div>
                  {row.note && <p className="mt-1 text-xs text-foreground/80">{row.note}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {row.dateLabel} · {row.dentistName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// The data model stays distinct from Appointment/"Historial de citas" on
// purpose — an appointment's own `notes` is a scheduling note, not a
// clinical finding (see ClinicalEncounterRecord's own comment in
// mock-data.ts). The *visual* presentation below, though, deliberately
// reuses the same "Historial de citas" pattern used elsewhere in Odentia
// (bg-surface panel, vertical border-l line, per-record dot marker,
// HISTORY_STATUS_BADGE_CLASS/STATUS_LABELS badge — see PatientHistoryPanel/
// HistoryEntry in appointment-detail-modal.tsx) for visual consistency
// across the app. Adapted, not reused as-is: this tab *is* the patient's
// full history (not a compact preview), so every field renders inline as
// its own line instead of being hidden behind that other pattern's hover
// tooltip, and nothing is truncated/line-clamped.
function AtencionesTab({ patient }: { patient: Patient }) {
  const encounters = patient.clinicalEncounters ?? [];

  if (encounters.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Aún no hay atenciones clínicas registradas.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface p-4">
      <ol className="flex flex-col gap-4 border-l border-border/70 pl-4">
        {encounters.map((encounter) => {
          const dentist = DENTISTS.find((d) => d.id === encounter.dentistId);
          return (
            <li key={encounter.id} className="relative">
              <span
                className="absolute -left-[19px] top-1.5 size-1.5 rounded-full bg-muted-foreground/40 ring-4 ring-surface"
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-label-foreground">
                  {encounter.dateLabel} · {encounter.timeLabel}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${HISTORY_STATUS_BADGE_CLASS[encounter.status]}`}
                >
                  {STATUS_LABELS[encounter.status]}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-label-foreground">{dentist?.name ?? "Sin asignar"}</p>
              <p className="mt-1.5 text-sm font-medium text-foreground">{encounter.treatment}</p>
              {encounter.findings && <p className="mt-1 text-sm text-foreground/80">{encounter.findings}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Mock metadata only (label/kind/fecha/profesional) — no real files, no
// upload/download, per task scope.
function DocumentosTab({ patient }: { patient: Patient }) {
  const documents = patient.clinicalDocuments ?? [];

  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Aún no hay documentos registrados.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {documents.map((doc) => {
        const dentist = DENTISTS.find((d) => d.id === doc.dentistId);
        return (
          <li key={doc.id} className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <NoteIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{doc.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {CLINICAL_DOCUMENT_KIND_LABELS[doc.kind]} · {doc.dateLabel} · {dentist?.name ?? "Sin asignar"}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
