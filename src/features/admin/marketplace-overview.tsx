import { StoreIcon } from "@/components/shell/icons";
import { MARKETPLACE_MESSAGE, MARKETPLACE_STATS } from "./mock-data";

// Given deliberate prominence per the platform dashboard's design — this
// is marketplace management/activity for Superadmin, not the supply-
// shopping promo clinic-facing roles see (see mock-data.ts's comment on
// ROLE_NAV_ITEMS.superadmin).
export function MarketplaceOverview() {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <StoreIcon className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Marketplace</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">Actividad del marketplace en la plataforma.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MARKETPLACE_STATS.map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-primary/15 bg-background p-3.5 text-center">
            <p className="text-xl font-bold tracking-tight text-foreground">{value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 rounded-lg border border-primary/20 bg-background px-4 py-3 text-sm font-medium text-primary">
        {MARKETPLACE_MESSAGE}
      </p>
    </div>
  );
}
