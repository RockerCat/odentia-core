import Link from "next/link";
import { CalendarIcon } from "@/components/shell/icons";
import type { MembershipRole } from "@/features/session/types";
import type { ClinicalProfessional } from "./appointments-data";
import { describeDefaultSchedule, usesDefaultSchedule, type AgendaAvailabilityBlock } from "./agenda-hours";

// Pilot E2E gap: a freshly provisioned clinic reaches Agenda with no
// professional_availability rows at all, so the board silently runs on
// agenda-hours.ts's Case A default. This is a WARNING, never a gate — Nueva
// cita keeps working on that same default. Derived purely from real DB rows
// (no localStorage/dismiss), so it disappears the moment every shown
// professional has an explicit schedule. Clinic Admin only: she's the one
// who can configure any professional's schedule from /configuracion.
export function resolveScheduleSetupAlert(
  role: MembershipRole,
  professionals: Pick<ClinicalProfessional, "professionalProfileId" | "firstName" | "lastName">[],
  availability: Pick<AgendaAvailabilityBlock, "professionalProfileId">[],
): { professionalNames: string[] } | null {
  if (role !== "clinic_admin") return null;
  const onDefault = professionals.filter((p) => usesDefaultSchedule(p.professionalProfileId, availability));
  if (onDefault.length === 0) return null;
  // Names only matter when the clinic has more than one professional —
  // in the solo Primary Use Case "tu clínica" already says who.
  const professionalNames = professionals.length > 1 ? onDefault.map((p) => `${p.firstName} ${p.lastName}`.trim()) : [];
  return { professionalNames };
}

export function ScheduleSetupAlert({ professionalNames }: { professionalNames: string[] }) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
          <CalendarIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Configura el horario de tu clínica</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Odentia está usando el horario predeterminado ({describeDefaultSchedule()}) mientras completas esta configuración.
            {professionalNames.length > 0 && ` Sin horario propio: ${professionalNames.join(", ")}.`}
          </p>
        </div>
      </div>
      <Link
        href="/configuracion#horario"
        className="shrink-0 self-start rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 sm:self-center"
      >
        Configurar horario
      </Link>
    </div>
  );
}
