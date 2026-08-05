import { PlusIcon } from "@/components/shell/icons";
import type { Appointment } from "./mock-data";
import { StatusBadge } from "./status-badge";

export function AppointmentsCard({ appointments }: { appointments: Appointment[] }) {
  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-5">
        <div>
          <h2 className="text-sm font-semibold">Agenda de hoy</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {appointments.length} citas hoy
          </p>
        </div>

        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <PlusIcon className="size-4" />
          <span className="hidden sm:inline">Nueva cita</span>
        </button>
      </div>

      <ul className="divide-y divide-border">
        {appointments.map((appointment) => (
          <li key={appointment.id} className="flex items-center gap-3 px-5 py-4 sm:gap-4">
            <span className="w-16 shrink-0 text-sm font-medium text-foreground/80 sm:w-20">
              {appointment.time}
            </span>

            <span className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary sm:flex">
              {appointment.initials}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{appointment.patientName}</p>
              <p className="truncate text-sm text-muted-foreground">{appointment.type}</p>
            </div>

            <StatusBadge status={appointment.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
