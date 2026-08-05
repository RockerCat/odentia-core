import type { SummaryMetric } from "./mock-data";

export function SummaryCards({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border border-border bg-background p-5">
          <p className="text-xs text-muted-foreground">{metric.label}</p>
          <p className="mt-1.5 text-xl font-semibold tracking-tight">{metric.value}</p>
        </div>
      ))}
    </div>
  );
}
