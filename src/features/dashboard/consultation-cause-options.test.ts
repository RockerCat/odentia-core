import { describe, expect, it } from "vitest";
import { causeOptionSearchText, isFrequentDentalCause, orderCauseOptions } from "./consultation-cause-options";
import { isConsultationCausaMotivoMissing } from "./encounter-finalize-readiness";

// Fixture shaped like RIPSCausaExternaVersion2 rows (official, uppercase,
// accented labels). 38/40 are the codes this codebase already documents
// for Enfermedad general / Promoción y mantenimiento (finalidad-causa.ts);
// the other codes are fixture-only.
const CATALOG = [
  { code: "21", label: "ACCIDENTE DE TRABAJO" },
  { code: "22", label: "ACCIDENTE EN EL HOGAR" },
  { code: "26", label: "EVENTO CATASTRÓFICO DE ORIGEN NATURAL" },
  { code: "32", label: "SOSPECHA DE VIOLENCIA FÍSICA" },
  { code: "38", label: "ENFERMEDAD GENERAL" },
  { code: "39", label: "ENFERMEDAD LABORAL" },
  { code: "40", label: "PROMOCIÓN Y MANTENIMIENTO DE LA SALUD – INTERVENCIONES INDIVIDUALES" },
  { code: "41", label: "INTERVENCIÓN COLECTIVA" },
];

// Mirrors Combobox's own filter exactly (src/components/combobox.tsx):
// getSearchText(item).toLowerCase().includes(query.trim().toLowerCase()).
function search(query: string) {
  return orderCauseOptions(CATALOG).filter((o) => causeOptionSearchText(o).toLowerCase().includes(query.trim().toLowerCase()));
}

describe("consultation cause selector", () => {
  it("keeps every official option exactly once, with its code and label untouched", () => {
    const ordered = orderCauseOptions(CATALOG);
    expect(ordered).toHaveLength(CATALOG.length);
    expect(new Set(ordered.map((o) => o.code)).size).toBe(CATALOG.length);
    for (const o of CATALOG) expect(ordered).toContainEqual(o);
  });

  it("lists the frequent dental causes first, in catalog order, then the rest in catalog order", () => {
    expect(orderCauseOptions(CATALOG).map((o) => o.code)).toEqual(["38", "40", "21", "22", "26", "32", "39", "41"]);
  });

  it("marks only official labels that exist — never a near match like Enfermedad laboral or a collective intervention", () => {
    expect(CATALOG.filter(isFrequentDentalCause).map((o) => o.code)).toEqual(["38", "40"]);
    expect(orderCauseOptions(CATALOG.filter((o) => o.code !== "40")).filter(isFrequentDentalCause).map((o) => o.code)).toEqual(["38"]);
  });

  it("search finds a frequent cause (with or without accents) and a non-frequent one; also by code", () => {
    expect(search("enfermedad").map((o) => o.code)).toEqual(["38", "39"]);
    expect(search("promocion").map((o) => o.code)).toEqual(["40"]);
    expect(search("promoción").map((o) => o.code)).toEqual(["40"]);
    expect(search("catastrofico").map((o) => o.code)).toEqual(["26"]);
    expect(search("violencia").map((o) => o.code)).toEqual(["32"]);
    expect(search("38").map((o) => o.code)).toEqual(["38"]);
    expect(search("").length).toBe(CATALOG.length);
  });

  it("selecting keeps the exact official code; nothing is preselected and the hint follows the value", () => {
    const service = { ripsServiceType: "consultation" as const, causaMotivoCode: "" };
    expect(isConsultationCausaMotivoMissing(service)).toBe(true); // no default
    const picked = search("enfermedad general")[0];
    const updated = { ...service, causaMotivoCode: picked.code };
    expect(updated.causaMotivoCode).toBe("38");
    expect(isConsultationCausaMotivoMissing(updated)).toBe(false);
  });
});
