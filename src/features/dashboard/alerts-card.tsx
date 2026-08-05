import type { OperationalAlert } from "./mock-data";

const TONE_DOT: Record<OperationalAlert["tone"], string> = {
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function AlertsCard({ alerts }: { alerts: OperationalAlert[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-base font-semibold">Alerts</h2>

      <ul className="mt-3 flex flex-col gap-3">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONE_DOT[alert.tone]}`} />
            <span className="text-foreground/80">{alert.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
