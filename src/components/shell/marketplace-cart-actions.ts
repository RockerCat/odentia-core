"use server";

import { cookies } from "next/headers";
import { parseMarketplaceCartCount } from "./parse-marketplace-cart-count";

// Must match Marketplace's own cookie name exactly (see COOKIE_NAME in
// odentia-marketplace/src/lib/cart.ts) — this is the one place in Core that
// needs to know it. Shared Cart Checkpoint A domain-shares this cookie
// (Production only — see that repo's writeCart()) so it simply arrives on
// Core's own incoming requests like any other cookie; Core never sets,
// mutates, or clears it, only ever reads what the browser already sent.
const MARKETPLACE_CART_COOKIE_NAME = "odentia_cart";

// The one bridge AuthenticatedUserMenu (a client component, so it has no
// direct access to cookies()) needs to read the incoming request's cart
// cookie server-side — see use-marketplace-cart-count.ts, the only caller.
// Intra-app only: this never calls out to Marketplace, never mutates
// anything, and is not a public API — it's Core's own Server Action,
// exactly like every other client/server bridge already in this codebase.
export async function getMarketplaceCartCount(): Promise<number> {
  const cookieStore = await cookies();
  return parseMarketplaceCartCount(cookieStore.get(MARKETPLACE_CART_COOKIE_NAME)?.value);
}
