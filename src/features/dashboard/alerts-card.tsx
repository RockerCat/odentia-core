import { ChevronIcon } from "@/components/shell/icons";
import type { OperationalAlert } from "./mock-data";

const TONE_DOT: Record<OperationalAlert["tone"], string> = {
  warning: "bg-warning",
  info: "bg-info",
  primary: "bg-primary",
};

export function AlertsCard({ alerts }: { alerts: OperationalAlert[] }) {
  return (
    <div className="rounded-xl border border-border bg-background p-6 sm:p-7">
      <h2 className="text-base font-semibold">Alertas</h2>

      <ul className="mt-5 flex flex-col gap-5">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONE_DOT[alert.tone]}`} />
            <span className="flex-1 text-foreground/80">
              {alert.message}
              {alert.description && (
                <span className="mt-0.5 block text-xs text-muted-foreground">{alert.description}</span>
              )}
            </span>
            <ChevronIcon className="mt-0.5 size-4 shrink-0 rotate-180 text-muted-foreground" />
          </li>
        ))}
      </ul>
    </div>
  );
}
