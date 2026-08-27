import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import type { Patient } from "./data";

// Shared by /pacientes/[id]/historia-clinica and /pacientes/[id]/historial-citas
// — neither has a real table to back it yet (no clinical schema, no
// appointments — see CLAUDE.md task scope). Real, tenant-scoped patient
// identity in the header (see the calling page's fetchPatientById), honest
// empty state below instead of the old fully-mock clinical module.
export function PatientPlaceholderScreen({
  patient,
  message,
}: {
  patient: Patient;
  message: string;
}) {
  const fullName = `${patient.firstName} ${patient.lastName}`.trim();
  const initials = `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-5 shadow-sm">
        <UserAvatar name={fullName} initials={initials} sizeClassName="size-12" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{patient.documentId || "Sin documento"}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-background p-8 text-center">
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="mt-1 text-xs text-muted-foreground">Estará disponible en una próxima fase.</p>
      </div>

      <Link href="/pacientes" className="text-xs font-medium text-primary hover:underline">
        ← Volver a Pacientes
      </Link>
    </div>
  );
}
