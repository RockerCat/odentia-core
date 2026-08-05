import { ArrowRightIcon, StoreIcon } from "@/components/shell/icons";

export function MarketplaceCard() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-foreground/70">
          <StoreIcon className="size-5" />
        </span>

        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Insumos para tu consultorio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compra insumos dentales desde Odentia con nuestro proveedor, LopaDent.
          </p>
        </div>
      </div>

      <button
        type="button"
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-foreground/5 sm:w-auto"
      >
        Ir al Marketplace
        <ArrowRightIcon className="size-4" />
      </button>
    </div>
  );
}
