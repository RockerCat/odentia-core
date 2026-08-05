import { ArrowRightIcon, StoreIcon } from "@/components/shell/icons";

export function MarketplaceCard() {
  return (
    <div
      className="relative overflow-hidden rounded-xl bg-[url('/marketplace-background.png')] bg-[center_right] bg-cover bg-no-repeat p-6 sm:p-7"
    >
      {/* Legibility wash only where the text sits — fades to fully
          transparent over the photo itself so it keeps its full clarity
          and contrast instead of looking washed out. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/85 via-white/40 to-transparent"
      />

      <div className="relative">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <StoreIcon className="size-5" />
        </span>

        <h2 className="mt-5 text-base font-semibold">Insumos para tu consultorio</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Compra insumos dentales desde Odentia con nuestro proveedor, LopaDent.
        </p>

        <button
          type="button"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
        >
          Ir al Marketplace
          <ArrowRightIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
