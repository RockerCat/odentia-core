import { UserAvatar } from "@/components/user-avatar";
import { CURRENT_PATIENT } from "@/lib/current-user";
import { MY_PATIENT_RECORD } from "./mock-data";

// Read-only for this iteration — no edit flow requested yet.
export function MyProfile() {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <UserAvatar
          name={CURRENT_PATIENT.name}
          initials={CURRENT_PATIENT.initials}
          avatar_url={CURRENT_PATIENT.avatar_url}
          sizeClassName="size-20"
        />
        <p className="text-base font-semibold">{CURRENT_PATIENT.name}</p>
        <p className="text-sm text-muted-foreground">{MY_PATIENT_RECORD.age} años</p>
      </div>

      <div className="mt-5 border-t border-border" />

      <dl className="mt-5 flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-label-foreground">Teléfono</dt>
          <dd className="font-medium">{CURRENT_PATIENT.phone}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-label-foreground">Correo</dt>
          <dd className="font-medium">{CURRENT_PATIENT.email}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-label-foreground">Documento</dt>
          <dd className="font-medium">{CURRENT_PATIENT.documentId}</dd>
        </div>
      </dl>

      <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-xs font-semibold text-primary uppercase">Clínica vinculada</p>
        <p className="mt-1 text-sm font-medium text-foreground">{CURRENT_PATIENT.clinicName}</p>
      </div>
    </div>
  );
}
