import type { CalendarIcon } from "@/components/shell/icons";

type Stat = {
  label: string;
  value: string;
  icon: typeof CalendarIcon;
};

// Shared visual language for both "KPIs principales" and "Actividad este
// mes" below — same bordered-card/icon-circle/big-number treatment
// SummaryCards already uses for the Agenda's own KPIs.
export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className="flex flex-col items-center rounded-lg border border-border bg-background p-3.5 text-center"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
          <p className="mt-1 text-[11px] text-label-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}
