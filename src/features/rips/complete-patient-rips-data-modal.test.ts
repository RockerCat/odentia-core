import { describe, expect, it } from "vitest";
import { sortCountriesColombiaFirst } from "./complete-patient-rips-data-modal";
import type { ReferenceValue } from "./catalog-data";

// Prompt Ninja "Colombia primero en País de residencia" — regression
// coverage for the one bit of pure logic this change introduces:
// presentation-only reordering, never touching codes/labels, never
// picking a default, never mutating the source array.

function country(code: string, label: string): ReferenceValue {
  return { id: code, catalogKey: "Pais", code, label, parentCode: null, versionLabel: "v1", validFrom: "2026-01-01", validTo: null, status: "active" };
}

describe("sortCountriesColombiaFirst", () => {
  it("puts Colombia (code 170) first regardless of its original position", () => {
    const countries = [country("032", "ARGENTINA"), country("170", "COLOMBIA"), country("076", "BRASIL")];
    const sorted = sortCountriesColombiaFirst(countries);
    expect(sorted[0]!.code).toBe("170");
  });

  it("orders every other country alphabetically by label after Colombia", () => {
    const countries = [country("076", "BRASIL"), country("170", "COLOMBIA"), country("032", "ARGENTINA"), country("840", "ESTADOS UNIDOS")];
    const sorted = sortCountriesColombiaFirst(countries);
    expect(sorted.map((c) => c.label)).toEqual(["COLOMBIA", "ARGENTINA", "BRASIL", "ESTADOS UNIDOS"]);
  });

  it("never mutates the source array", () => {
    const countries = [country("076", "BRASIL"), country("170", "COLOMBIA"), country("032", "ARGENTINA")];
    const original = [...countries];
    sortCountriesColombiaFirst(countries);
    expect(countries).toEqual(original);
  });

  it("a catalog with no Colombia row at all just sorts alphabetically, never inventing one", () => {
    const countries = [country("076", "BRASIL"), country("032", "ARGENTINA")];
    const sorted = sortCountriesColombiaFirst(countries);
    expect(sorted.map((c) => c.code)).toEqual(["032", "076"]);
  });

  it("an empty catalog stays empty", () => {
    expect(sortCountriesColombiaFirst([])).toEqual([]);
  });
});
