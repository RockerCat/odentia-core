import { describe, expect, it } from "vitest";
import { parseMarketplaceCartCount } from "./parse-marketplace-cart-count";

// Marketplace's odentia_cart cookie is untrusted input from a separate
// app — this proves the header badge can never break regardless of what
// ends up in that cookie, and that the count semantics (sum of quantities,
// not number of keys) match Marketplace's own getCartCount() exactly.
describe("parseMarketplaceCartCount", () => {
  it("returns 0 when the cookie is absent", () => {
    expect(parseMarketplaceCartCount(undefined)).toBe(0);
  });

  it("returns 0 for an empty cart", () => {
    expect(parseMarketplaceCartCount(JSON.stringify({}))).toBe(0);
  });

  it("returns the quantity for a single line", () => {
    expect(parseMarketplaceCartCount(JSON.stringify({ a: 1 }))).toBe(1);
  });

  it("sums quantities across multiple lines, not the number of lines", () => {
    expect(parseMarketplaceCartCount(JSON.stringify({ a: 2, b: 3 }))).toBe(5);
  });

  it("returns 0 for invalid JSON", () => {
    expect(parseMarketplaceCartCount("not json")).toBe(0);
  });

  it("returns 0 for a JSON array instead of an object", () => {
    expect(parseMarketplaceCartCount(JSON.stringify([1, 2, 3]))).toBe(0);
  });

  it("ignores non-numeric, non-finite, and non-positive quantities", () => {
    expect(
      parseMarketplaceCartCount(
        JSON.stringify({ a: "2", b: null, c: Infinity, d: -1, e: 0, f: 4 }),
      ),
    ).toBe(4);
  });
});
