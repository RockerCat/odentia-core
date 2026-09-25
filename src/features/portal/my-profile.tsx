import { MyProfileCard, type MyProfileCardData } from "./my-profile-card";
import type { PatientContext } from "@/features/session/types";

// Real identity — patients.first_name/last_name/phone/email/document_id/
// birth_date and the linked clinic's name (see resolve-patient-context.ts),
// never the old mock CURRENT_PATIENT/MY_PATIENT_RECORD. The patient may
// edit only her own phone (MyProfileCard); the rest is read-only.
export function MyProfile({
  context,
  documentTypeLabel = null,
  usualDentist = null,
}: {
  context: PatientContext;
  // TipoDocumento label for patient.documentType (resolved server-side).
  documentTypeLabel?: string | null;
  usualDentist?: MyProfileCardData["usualDentist"];
}) {
  if (context.status !== "ok") {
    // src/lib/supabase/proxy.ts already gates this route — reaching here
    // with anything but "ok" would mean the real session changed between
    // the gate and this render (e.g. revoked mid-session). Honest fallback,
    // never a fabricated profile.
    return (
      <div className="rounded-2xl border border-border bg-background p-5 text-center text-sm text-muted-foreground shadow-sm sm:p-6">
        No pudimos cargar tu perfil. Intenta de nuevo en unos minutos.
      </div>
    );
  }

  return <MyProfileCard data={buildMyProfileCardData(context, documentTypeLabel, usualDentist)} />;
}

export function buildMyProfileCardData(
  context: Extract<PatientContext, { status: "ok" }>,
  documentTypeLabel: string | null,
  usualDentist: MyProfileCardData["usualDentist"],
): MyProfileCardData {
  const { patient, clinic, profile } = context;
  const hasRipsDocument = Boolean(patient.documentType && patient.documentNumber);
  return {
    name: `${patient.firstName} ${patient.lastName}`.trim(),
    initials: `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase() || "?",
    age: patient.birthDate ? computeAge(patient.birthDate) : null,
    avatarUrl: profile.avatarUrl,
    phone: patient.phone,
    email: patient.email,
    birthDateLabel: patient.birthDate ? formatBirthDate(patient.birthDate) : null,
    // RIPS identity when set (the catalog label, or the raw code if the
    // label couldn't be resolved); else the legacy free-text document.
    documentTypeLabel: hasRipsDocument ? (documentTypeLabel ?? patient.documentType) : null,
    documentNumber: hasRipsDocument ? patient.documentNumber : patient.documentId,
    clinicName: clinic.name,
    usualDentist,
  };
}

// "2006-03-12" → "12 de marzo de 2006" — parsed as a calendar date (no
// timezone shift).
export function formatBirthDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function computeAge(birthDateIso: string): number {
  const birthDate = new Date(birthDateIso);
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() || (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}
