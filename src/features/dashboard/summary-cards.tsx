import type { SummaryMetric } from "./mock-data";

export function SummaryCards({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.label} className="rounded-lg border border-border bg-background p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <p className="min-w-0 truncate text-[11px] text-muted-foreground" title={metric.label}>
                {metric.label}
              </p>
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight">{metric.value}</p>
            <p className="truncate text-[10px] text-muted-foreground" title={metric.subtitle}>
              {metric.subtitle}
            </p>
          </div>
        );
      })}
    </div>
  );
}
