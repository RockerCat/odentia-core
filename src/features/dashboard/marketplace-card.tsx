import { ArrowRightIcon, StoreIcon } from "@/components/shell/icons";

export function MarketplaceCard() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-5 sm:p-6">
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
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
      >
        Ir al Marketplace
        <ArrowRightIcon className="size-4" />
      </button>
    </div>
  );
}
