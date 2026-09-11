import { describe, expect, it } from "vitest";
import { MONTH_NAMES_ES, getPeriodYearOptions, inputValueToPeriod, periodToInputValue } from "./rips-screen";

// Regression coverage for "PROMPT NINJA — Mejorar selector de período
// RIPS y mantener UI completamente en español": the Mes/Año <select>
// pair replaced Chrome's native <input type="month"> (English calendar
// chrome, inconsistent with the rest of Odentia) but must produce the
// EXACT same "YYYY-MM" string — and therefore the exact same
// RipsExportPeriod — handlePeriodChange() already expected.

describe("periodToInputValue / inputValueToPeriod round-trip (Mes/Año selects)", () => {
  it("round-trips a plain mid-year month", () => {
    const period = { year: 2026, month: 7 };
    expect(inputValueToPeriod(periodToInputValue(period))).toEqual(period);
  });

  it("round-trips January correctly (no off-by-one at the low boundary)", () => {
    const period = { year: 2026, month: 1 };
    expect(periodToInputValue(period)).toBe("2026-01");
    expect(inputValueToPeriod("2026-01")).toEqual(period);
  });

  it("round-trips December correctly (no off-by-one at the high boundary)", () => {
    const period = { year: 2026, month: 12 };
    expect(periodToInputValue(period)).toBe("2026-12");
    expect(inputValueToPeriod("2026-12")).toEqual(period);
  });

  it("changing the year preserves the selected month exactly", () => {
    const period = { year: 2026, month: 9 };
    const changedYear = { year: 2027, month: period.month };
    expect(inputValueToPeriod(periodToInputValue(changedYear))).toEqual({ year: 2027, month: 9 });
  });

  it("changing the month preserves the selected year exactly", () => {
    const period = { year: 2026, month: 9 };
    const changedMonth = { year: period.year, month: 3 };
    expect(inputValueToPeriod(periodToInputValue(changedMonth))).toEqual({ year: 2026, month: 3 });
  });
});

describe("MONTH_NAMES_ES", () => {
  it("lists exactly the 12 Spanish month names, in calendar order", () => {
    expect(MONTH_NAMES_ES).toEqual([
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ]);
  });

  it("never contains an English month name", () => {
    const english = ["January", "February", "March", "April", "June", "July", "August", "September", "October", "November", "December"];
    for (const name of english) expect(MONTH_NAMES_ES).not.toContain(name);
  });
});

describe("getPeriodYearOptions", () => {
  it("includes the reference year, one year ahead, and the configured years back", () => {
    expect(getPeriodYearOptions(2026)).toEqual([2027, 2026, 2025, 2024, 2023]);
  });

  it("always includes next year, so the list never goes stale right as a new year starts", () => {
    expect(getPeriodYearOptions(2030)).toContain(2031);
  });
});
