import { UserAvatar } from "@/components/user-avatar";
import type { PatientContext } from "@/features/session/types";

// Real identity — patients.first_name/last_name/phone/email/document_id/
// birth_date and the linked clinic's name (see resolve-patient-context.ts),
// never the old mock CURRENT_PATIENT/MY_PATIENT_RECORD. Read-only for this
// iteration — no edit flow requested yet.
export function MyProfile({ context }: { context: PatientContext }) {
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

  const { patient, clinic } = context;
  const name = `${patient.firstName} ${patient.lastName}`.trim();
  const initials = `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase() || "?";
  const age = patient.birthDate ? computeAge(patient.birthDate) : null;

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <UserAvatar name={name} initials={initials} sizeClassName="size-20" />
        <p className="text-base font-semibold">{name}</p>
        {age !== null && <p className="text-sm text-muted-foreground">{age} años</p>}
      </div>

      <div className="mt-5 border-t border-border" />

      <dl className="mt-5 flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-label-foreground">Teléfono</dt>
          <dd className="font-medium">{patient.phone || "No registrado"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-label-foreground">Correo</dt>
          <dd className="font-medium">{patient.email || "No registrado"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-label-foreground">Documento</dt>
          <dd className="font-medium">{patient.documentId || "No registrado"}</dd>
        </div>
      </dl>

      <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-xs font-semibold text-primary uppercase">Clínica vinculada</p>
        <p className="mt-1 text-sm font-medium text-foreground">{clinic.name}</p>
      </div>
    </div>
  );
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
