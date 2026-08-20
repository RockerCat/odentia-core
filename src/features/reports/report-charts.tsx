import type { ChartPoint, TreatmentRankingRow } from "./report-selectors";

// Deliberately plain CSS/SVG-free bars (no charting library) — the task
// calls for "gráficas sencillas", not decorative ones, and this is the only
// place in the app that renders a chart so far (see CLAUDE.md: avoid
// unnecessary dependencies for a single use case).
export function EmptyChartState({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>;
}

const BAR_MAX_HEIGHT = 128;

export function TimeSeriesBarChart({ data }: { data: ChartPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hasData = data.some((d) => d.value > 0);
  if (!hasData) return <EmptyChartState message="Sin atenciones completadas en este período." />;

  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1 sm:gap-3">
      {data.map((point, i) => (
        <div key={`${point.label}-${i}`} className="flex min-w-[26px] flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-medium text-foreground/70">{point.value || ""}</span>
          <div
            className="w-full rounded-t-md bg-primary/80"
            style={{ height: `${Math.max(3, Math.round((point.value / max) * BAR_MAX_HEIGHT))}px` }}
          />
          <span className="text-center text-[10px] whitespace-nowrap text-muted-foreground">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

export function HorizontalRankingChart({ rows }: { rows: TreatmentRankingRow[] }) {
  if (rows.length === 0) return <EmptyChartState message="Sin tratamientos completados en este período." />;
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.treatment} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-foreground/80 sm:w-44 sm:text-sm">{row.treatment}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-primary/80" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
          <span className="w-6 shrink-0 text-right text-xs font-semibold text-foreground sm:text-sm">{row.count}</span>
        </div>
      ))}
    </div>
  );
}
