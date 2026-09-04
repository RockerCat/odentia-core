import type { FindingType, OdontogramData } from "@/features/dashboard/odontogram-teeth";
import type { ClinicalDocumentRecord } from "../clinical-documents-data";
import { CLINICAL_DOCUMENT_KIND_LABELS } from "../clinical-documents-data";
import type { ClinicalEncounterRecord } from "../clinical-encounters-data";
import type { Patient } from "../data";
import type { PatientMedicalHistory } from "../medical-history-data";
import { toOdontogramData, type ToothFindingRecord } from "../tooth-findings-data";

// Pure data-shaping for the real Historia Clínica PDF — takes the same raw
// real rows the screen already holds (patient/medicalHistory/toothFindings/
// clinicalEncounters/clinicalDocuments) plus one resolved profileId→name
// map (built once via fetchTeamMembers, see the screen's handleDownloadPdf),
// and produces a fully-resolved, plain-data view-model. Kept separate from
// real-clinical-record-document.tsx (the react-pdf rendering) so the
// rendering component stays a pure function of already-resolved data, same
// as the approved reference document's own getOdontogramFindingRows
// pattern (clinical-record-screen.tsx) — resolve first, render after,
// never inside the PDF tree itself.

export type ProfessionalDirectory = Map<string, { name: string; specialtyName: string | null }>;

function professionalName(directory: ProfessionalDirectory, profileId: string | null): string {
  if (!profileId) return "Sin asignar";
  return directory.get(profileId)?.name ?? "Sin asignar";
}

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });
const MONTH_ABBR = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

// Same "27 ago 2026, 10:30 AM" shape as the approved reference document's
// own formatUpdatedNowLabel (clinical-record-screen.tsx) — reproduced
// here, not imported, since that module is the preserved mock/demo
// reference and is never touched or imported into real code.
export function formatGeneratedAtLabel(): string {
  const now = new Date();
  const dateLabel = `${now.getDate()} ${MONTH_ABBR[now.getMonth()]} ${now.getFullYear()}`;
  const hours24 = now.getHours();
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${dateLabel}, ${hours12}:${minutes} ${period}`;
}

function ageOf(patient: Patient): number | null {
  if (!patient.birthDate) return null;
  const birth = new Date(patient.birthDate);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

const PATIENT_SINCE_FORMATTER = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric" });

export type PdfFindingRow = {
  fdi: number;
  type: FindingType;
  note: string;
  dateLabel: string;
  professionalName: string;
};

export type PdfEncounterRow = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  professionalName: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  indications: string | null;
};

export type PdfDocumentRow = {
  id: string;
  label: string;
  kindLabel: string;
  dateLabel: string;
  professionalName: string;
};

export type RealClinicalRecordPdfData = {
  patientFullName: string;
  patientAge: number | null;
  documentId: string;
  phone: string;
  email: string;
  patientSinceLabel: string;
  allergies: string | null;
  medicalConditions: string | null;
  currentMedications: string | null;
  antecedentesUpdatedLabel: string | null;
  anamnesisFields: { label: string; value: string }[];
  conditionFields: { label: string; value: string }[];
  odontogramData: OdontogramData;
  odontogramUpdatedLabel: string;
  findingRows: PdfFindingRow[];
  encounters: PdfEncounterRow[];
  documents: PdfDocumentRow[];
  generatedAtLabel: string;
};

export function buildRealClinicalRecordPdfData({
  patient,
  medicalHistory,
  toothFindings,
  clinicalEncounters,
  clinicalDocuments,
  professionals,
}: {
  patient: Patient;
  medicalHistory: PatientMedicalHistory | null;
  toothFindings: ToothFindingRecord[];
  clinicalEncounters: ClinicalEncounterRecord[];
  clinicalDocuments: ClinicalDocumentRecord[];
  professionals: ProfessionalDirectory;
}): RealClinicalRecordPdfData {
  const antecedentesUpdatedLabel = medicalHistory
    ? (() => {
        const resolved = medicalHistory.updatedBy ? professionals.get(medicalHistory.updatedBy) : undefined;
        const dateLabel = DATE_FORMATTER.format(new Date(medicalHistory.updatedAt));
        return resolved ? `${dateLabel} · ${resolved.name}${resolved.specialtyName ? ` · ${resolved.specialtyName}` : ""}` : dateLabel;
      })()
    : null;

  const anamnesisFields = [
    { label: "Antecedentes familiares", value: medicalHistory?.relevantFamilyHistory ?? "Sin registrar" },
    { label: "Cirugías / hospitalizaciones", value: medicalHistory?.surgeriesOrHospitalizations ?? "Sin registrar" },
    { label: "Observaciones generales", value: medicalHistory?.observations ?? "Sin registrar" },
  ];
  const conditionFields = [
    { label: "Alergias", value: medicalHistory?.allergies ?? "Sin registrar" },
    { label: "Medicamentos actuales", value: medicalHistory?.currentMedications ?? "Sin registrar" },
    { label: "Condiciones médicas", value: medicalHistory?.medicalConditions ?? "Sin registrar" },
  ];

  // Latest finding per tooth, sorted by FDI — same "latest wins" rule the
  // on-screen odontogram already uses (see odontograma-tab.tsx's own
  // getFindingRows), reproduced here rather than imported since that's a
  // Client Component module.
  const byTooth = new Map<number, ToothFindingRecord[]>();
  for (const finding of toothFindings) {
    byTooth.set(finding.toothFdi, [...(byTooth.get(finding.toothFdi) ?? []), finding]);
  }
  const findingRows: PdfFindingRow[] = Array.from(byTooth.entries())
    .map(([fdi, findings]) => {
      const latest = findings[findings.length - 1];
      return {
        fdi,
        type: latest.findingType,
        note: latest.note ?? "",
        dateLabel: DATE_FORMATTER.format(new Date(latest.updatedAt)),
        professionalName: professionalName(professionals, latest.recordedBy),
      };
    })
    .sort((a, b) => a.fdi - b.fdi);

  // Most recently updated finding overall (not per-tooth) — same rule
  // odontograma-tab.tsx already uses on-screen for "Actualizado [fecha] ·
  // [odontólogo]". If the professional can't be resolved, show only the
  // date (never "Sin asignar" tacked on) — same fallback shape as
  // antecedentesUpdatedLabel above.
  const lastUpdatedFinding = toothFindings.reduce<ToothFindingRecord | null>(
    (latest, f) => (!latest || f.updatedAt > latest.updatedAt ? f : latest),
    null,
  );
  const odontogramUpdatedLabel = lastUpdatedFinding
    ? (() => {
        const resolved = lastUpdatedFinding.recordedBy ? professionals.get(lastUpdatedFinding.recordedBy) : undefined;
        const dateLabel = DATE_FORMATTER.format(new Date(lastUpdatedFinding.updatedAt));
        return resolved ? `${dateLabel} · ${resolved.name}` : dateLabel;
      })()
    : "Sin registrar";

  const encounters: PdfEncounterRow[] = clinicalEncounters.map((encounter) => {
    const occurredAt = new Date(encounter.occurredAt);
    return {
      id: encounter.id,
      dateLabel: DATE_FORMATTER.format(occurredAt),
      timeLabel: TIME_FORMATTER.format(occurredAt),
      professionalName: professionalName(professionals, encounter.attendedBy),
      reason: encounter.reason,
      diagnosis: encounter.diagnosis,
      treatment: encounter.treatment,
      notes: encounter.notes,
      indications: encounter.indications,
    };
  });

  // Active documents only — archived ones are logically hidden from the
  // clinical record's default view (same "Activos" default as
  // documentos-tab.tsx), not an audit trail export.
  const documents: PdfDocumentRow[] = clinicalDocuments
    .filter((d) => !d.archivedAt)
    .map((d) => ({
      id: d.id,
      label: d.title || d.filename,
      kindLabel: CLINICAL_DOCUMENT_KIND_LABELS[d.kind],
      dateLabel: DATE_FORMATTER.format(new Date(d.createdAt)),
      professionalName: professionalName(professionals, d.uploadedBy),
    }));

  return {
    patientFullName: `${patient.firstName} ${patient.lastName}`.trim(),
    patientAge: ageOf(patient),
    documentId: patient.documentId || "Sin documento",
    phone: patient.phone || "Sin teléfono",
    email: patient.email || "Sin correo",
    patientSinceLabel: PATIENT_SINCE_FORMATTER.format(new Date(patient.createdAt)),
    allergies: medicalHistory?.allergies ?? null,
    medicalConditions: medicalHistory?.medicalConditions ?? null,
    currentMedications: medicalHistory?.currentMedications ?? null,
    antecedentesUpdatedLabel,
    anamnesisFields,
    conditionFields,
    odontogramData: toOdontogramData(toothFindings),
    odontogramUpdatedLabel,
    findingRows,
    encounters,
    documents,
    generatedAtLabel: formatGeneratedAtLabel(),
  };
}
