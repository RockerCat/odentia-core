"use client";

import Link from "next/link";
import { ChevronIcon } from "@/components/shell/icons";
import { UserAvatar } from "@/components/user-avatar";
import type { Appointment } from "@/features/dashboard/appointments-data";
import { formatDateLabel, formatTimeLabel } from "@/features/dashboard/real-format";
import { getDisplayStatus, getHistoryStatusBadgeClass, getStatusLabel } from "@/features/dashboard/real-status";
import type { Patient } from "./data";

// Real "Historial completo de citas" screen — reached from "Ver historial
// completo"/"Ver historia completa" (RealAppointmentDetailModal,
// RealClinicalEncounterScreen). Backed by the SAME fetchAppointmentsForPatient
// query as RealAppointmentDetailModal's own "Historial de citas" panel (see
// this route's page.tsx) — one source of truth, never a second appointments
// query. Visual layout (header card, vertical timeline, status badge,
// professional/room line, treatment line, notes) is a deliberate port of the
// approved demo's own patient-appointment-history-screen.tsx (still-mock,
// orphaned — kept only as this screen's visual reference, see that file's
// own comment); status labels/colors come from real-status.ts's
// getDisplayStatus/getStatusLabel/getHistoryStatusBadgeClass so this list
// reads exactly like Agenda/the detail modal, "Sin cerrar" included.
export function RealPatientAppointmentHistoryScreen({
  patient,
  appointments,
  professionalNameById,
}: {
  patient: Patient;
  appointments: Appointment[];
  professionalNameById: Record<string, string>;
}) {
  const fullName = `${patient.firstName} ${patient.lastName}`.trim();
  const initials = `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <Link
          href="/pacientes"
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground"
        >
          <ChevronIcon className="size-3.5" />
          Atrás
        </Link>

        <div className="mt-3 flex items-center gap-3">
          <UserAvatar name={fullName} initials={initials} sizeClassName="size-12" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{fullName}</p>
            <p className="truncate text-sm text-muted-foreground">
              {[patient.documentId, patient.phone].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </div>

      {appointments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Este paciente aún no tiene historial de citas registrado.
        </div>
      ) : (
        <div className="rounded-xl bg-surface p-4">
          <ol className="flex flex-col gap-4 border-l border-border/70 pl-4">
            {appointments.map((item) => {
              const displayStatus = getDisplayStatus(item);
              const dayLabel = formatDateLabel(item.startsAt);
              const timeLabel = formatTimeLabel(item.startsAt);
              const professionalName = professionalNameById[item.professionalProfileId] ?? "Sin asignar";
              return (
                <li key={item.id} className="relative">
                  <span
                    className="absolute -left-[19px] top-1.5 size-1.5 rounded-full bg-muted-foreground/40 ring-4 ring-surface"
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-label-foreground">
                      {dayLabel} · {timeLabel}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${getHistoryStatusBadgeClass(displayStatus)}`}
                    >
                      {getStatusLabel(displayStatus)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-label-foreground">
                    {professionalName}
                    {item.room && ` · ${item.room}`}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-foreground">{item.reason ?? "Sin definir"}</p>
                  {item.notes && <p className="mt-1 text-sm text-foreground/80">{item.notes}</p>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
