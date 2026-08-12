import { ToothIcon } from "@/components/shell/icons";
import {
  chronologicalKey,
  DENTISTS,
  STATUS_LABELS,
  STATUS_STYLES,
  WEEK_APPOINTMENTS,
  WEEK_DAYS,
} from "@/features/dashboard/mock-data";
import { CURRENT_PATIENT } from "@/lib/current-user";
import { MY_PATIENT_RECORD } from "./mock-data";

const RECENT_LIMIT = 5;

// First mock visual only, per this iteration's scope — read-only, no
// editing of clinical info/procedures, and no odontogram/documents yet
// (see PROJECT_STATUS.md).
export function DentalHealth() {
  const own = WEEK_APPOINTMENTS.filter((a) => a.patientName === CURRENT_PATIENT.name).sort(
    (a, b) => chronologicalKey(b, WEEK_DAYS) - chronologicalKey(a, WEEK_DAYS),
  );
  const usualDentist = DENTISTS.find((d) => d.id === MY_PATIENT_RECORD.usualDentistId);
  const recentTreatments = Array.from(
    new Set(own.filter((a) => a.status === "completed").map((a) => a.type).filter(Boolean)),
  ).slice(0, 4) as string[];

  return (
    <div className="flex flex-col gap-5">
      {MY_PATIENT_RECORD.allergies && (
        <div className="rounded-lg border border-warning/25 bg-warning/10 px-3.5 py-2.5">
          <p className="text-xs font-semibold text-warning uppercase">Alertas / alergias</p>
          <p className="mt-0.5 text-sm text-warning">{MY_PATIENT_RECORD.allergies}</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ToothIcon className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Información clínica compartida</h2>
            <p className="text-xs text-muted-foreground">
              Vista informativa — tu clínica gestiona tu historia clínica.
            </p>
          </div>
        </div>

        <dl className="mt-4 flex flex-col gap-2.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-label-foreground">Odontólogo habitual</dt>
            <dd className="font-medium">{usualDentist?.name ?? "Sin asignar"}</dd>
          </div>
        </dl>

        {recentTreatments.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-label-foreground">Tratamientos recientes</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {recentTreatments.map((treatment) => (
                <span
                  key={treatment}
                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground/80"
                >
                  {treatment}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">Últimas atenciones</h2>
        {own.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aún no tienes atenciones registradas.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {own.slice(0, RECENT_LIMIT).map((appt) => {
              const dentist = DENTISTS.find((d) => d.id === appt.dentistId);
              const dayLabel = WEEK_DAYS.find((d) => d.key === appt.day)?.label ?? appt.day;
              return (
                <li
                  key={appt.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{appt.type ?? "Consulta"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dayLabel}, {appt.time} · {dentist?.name ?? "Sin asignar"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appt.status]}`}
                  >
                    {STATUS_LABELS[appt.status]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
