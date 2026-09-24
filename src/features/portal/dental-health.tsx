import Link from "next/link";
import { ToothIcon } from "@/components/shell/icons";
import type { DentalHealthView } from "./dental-health-data";

// "Mi salud dental" — renders ONLY buildDentalHealthView's real output
// (see dental-health-data.ts). Every section has its own honest empty and
// error state; nothing here is ever mock or placeholder data.
const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });

const CARD = "rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6";

function SectionError() {
  return <p className="text-sm text-muted-foreground">No pudimos cargar esta información. Intenta de nuevo en unos minutos.</p>;
}

export function DentalHealth({ view }: { view: DentalHealthView }) {
  const { allergies, usualDentistName, recentServices, recentEncounters } = view;

  return (
    <div className="flex flex-col gap-5">
      {allergies.status === "ok" && allergies.value && (
        <div className="rounded-lg border border-warning/25 bg-warning/10 px-3.5 py-2.5">
          <p className="text-xs font-semibold text-warning uppercase">Alertas / alergias</p>
          <p className="mt-0.5 text-sm text-warning">{allergies.value}</p>
        </div>
      )}
      {allergies.status === "error" && (
        <div className="rounded-lg border border-border bg-background px-3.5 py-2.5">
          <p className="text-xs font-semibold text-label-foreground uppercase">Alertas / alergias</p>
          <div className="mt-0.5">
            <SectionError />
          </div>
        </div>
      )}

      <div className={CARD}>
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ToothIcon className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Información clínica compartida</h2>
            <p className="text-xs text-muted-foreground">Vista informativa — tu clínica gestiona tu historia clínica.</p>
          </div>
        </div>

        <dl className="mt-4 flex flex-col gap-2.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-label-foreground">Odontólogo habitual</dt>
            <dd className="font-medium">
              {usualDentistName.status === "error" ? "—" : (usualDentistName.value ?? "Aún sin atenciones")}
            </dd>
          </div>
        </dl>

        {recentServices.status === "ok" && recentServices.value.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-label-foreground">Servicios recientes</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {recentServices.value.map((service) => (
                <span key={service} className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground/80">
                  {service}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Últimas atenciones</h2>
          <Link href="/portal/historia" className="text-xs font-medium text-primary hover:text-primary/80">
            Ver mi historia clínica
          </Link>
        </div>
        <div className="mt-3">
          {recentEncounters.status === "error" ? (
            <SectionError />
          ) : recentEncounters.value.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no tienes atenciones registradas.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentEncounters.value.map((encounter) => {
                const occurredAt = new Date(encounter.occurredAt);
                return (
                  <li key={encounter.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{encounter.reason ?? "Atención"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {DATE_FORMATTER.format(occurredAt)} · {TIME_FORMATTER.format(occurredAt)}
                        {encounter.professionalName ? ` · ${encounter.professionalName}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border bg-foreground/[0.03] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Finalizada
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function DentalHealthSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando tu información">
      <div className={CARD}>
        <div className="flex items-center gap-3">
          <span className="size-10 shrink-0 animate-pulse rounded-full bg-foreground/10" />
          <div className="flex flex-col gap-1.5">
            <span className="h-3.5 w-48 animate-pulse rounded bg-foreground/10" />
            <span className="h-2.5 w-64 animate-pulse rounded bg-foreground/10" />
          </div>
        </div>
        <span className="mt-5 block h-3 w-full animate-pulse rounded bg-foreground/10" />
      </div>
      <div className={CARD}>
        <span className="block h-3.5 w-40 animate-pulse rounded bg-foreground/10" />
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block h-12 animate-pulse rounded-lg bg-foreground/[0.06]" />
          ))}
        </div>
      </div>
    </div>
  );
}
