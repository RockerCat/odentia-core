import type { SummaryMetric } from "./mock-data";

export function SummaryCards({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted-foreground">{metric.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{metric.value}</p>
        </div>
      ))}
    </div>
  );
}
