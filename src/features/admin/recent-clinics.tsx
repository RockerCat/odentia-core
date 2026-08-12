import { PLAN_STATUS_LABELS, PLAN_STATUS_STYLES, RECENT_CLINICS } from "./mock-data";

// "Ver clínica" isn't wired to a real clinic-detail screen yet (no backend
// this phase — see PROJECT_STATUS.md), same not-yet-functional pattern as
// other CTAs across this prototype (e.g. the landing's "Registra tu
// clínica").
export function RecentClinics() {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold">Clínicas recientes</h2>

      <div className="mt-4 flex flex-col gap-2.5">
        {RECENT_CLINICS.map((clinic) => (
          <div
            key={clinic.id}
            className="flex flex-col gap-2.5 rounded-lg border border-border p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 sm:w-48 sm:shrink-0">
              <p className="truncate text-sm font-medium text-foreground">{clinic.name}</p>
              <p className="truncate text-xs text-muted-foreground">Admin: {clinic.adminName}</p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:flex-1">
              <span>{clinic.professionals} profesionales</span>
              <span>{clinic.patients} pacientes</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${PLAN_STATUS_STYLES[clinic.planStatus]}`}
              >
                {PLAN_STATUS_LABELS[clinic.planStatus]}
              </span>
              <span>{clinic.lastActivityLabel}</span>
            </div>

            <button
              type="button"
              className="shrink-0 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 sm:self-center"
            >
              Ver clínica
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
