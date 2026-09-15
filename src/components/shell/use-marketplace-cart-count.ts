"use client";

import { useEffect, useState } from "react";
import { getMarketplaceCartCount } from "./marketplace-cart-actions";

// Resolved via a Server Action (see marketplace-cart-actions.ts) because
// this hook's callers (AuthenticatedUserMenu and, through it, both the app
// shell Header and the public landing header) are client components with
// no access to cookies() themselves — same shape as
// src/features/session/use-current-user-context.ts resolving real identity
// for this exact same header family. Starts at 0 (no badge) until the real
// count resolves, so a genuinely empty cart and "still loading" are
// indistinguishable — never a stale or guessed non-zero flash.
export function useMarketplaceCartCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getMarketplaceCartCount()
      .then((result) => {
        if (!cancelled) setCount(result);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
