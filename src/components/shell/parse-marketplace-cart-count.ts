// Pure parsing logic, split out of marketplace-cart-actions.ts so it can be
// unit-tested directly — a "use server" file may only export async
// functions (they compile into RPC endpoints), so this synchronous helper
// cannot live there itself.
//
// The odentia_cart cookie is owned and written entirely by Marketplace —
// never trust its shape here. Same count semantics as Marketplace's own
// getCartCount() (odentia-marketplace/src/lib/cart.ts): sum of quantities,
// not number of keys. Absent, corrupt, or unexpectedly-shaped content
// always degrades to 0 rather than throwing — a badge must never break the
// header.
export function parseMarketplaceCartCount(raw: string | undefined): number {
  if (!raw) return 0;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return 0;

  return Object.values(parsed as Record<string, unknown>).reduce<number>(
    (sum, value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? sum + value : sum),
    0,
  );
}
