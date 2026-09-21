import { describe, expect, it } from "vitest";
import { EXAMEN_ODONTOLOGICO_CODE, isInDentalPriorityScope } from "./catalog-data";

// Regression coverage for Prompt Ninja "priorizar Z012 + K00–K14 en
// selector odontológico" — isInDentalPriorityScope is the one new piece
// of pure logic this task adds; it characterizes (never re-implements)
// the same boundary the real query filter in searchDiagnoses encodes
// server-side. Every other function in this file stays untested at the
// unit level, same convention as before (no Supabase mock has ever been
// needed here).

describe("isInDentalPriorityScope", () => {
  describe("without Examen odontológico (empty-focus 'Odontología' browse scope)", () => {
    it("includes K00 (lower bound) and every code up to K149", () => {
      expect(isInDentalPriorityScope("K00", false)).toBe(true);
      expect(isInDentalPriorityScope("K021", false)).toBe(true);
      expect(isInDentalPriorityScope("K149", false)).toBe(true);
    });

    it("excludes K15 (upper bound, exclusive)", () => {
      expect(isInDentalPriorityScope("K15", false)).toBe(false);
    });

    it("excludes Z012 when Examen odontológico is not included", () => {
      expect(isInDentalPriorityScope(EXAMEN_ODONTOLOGICO_CODE, false)).toBe(false);
    });

    it("excludes an unrelated code (e.g. an artificial-limb fitting code)", () => {
      expect(isInDentalPriorityScope("Z441", false)).toBe(false);
    });
  });

  describe("with Examen odontológico (typed dental search scope)", () => {
    it("includes Z012 exactly", () => {
      expect(isInDentalPriorityScope(EXAMEN_ODONTOLOGICO_CODE, true)).toBe(true);
    });

    it("never includes Z011 or Z013 just because they're adjacent to Z012", () => {
      expect(isInDentalPriorityScope("Z011", true)).toBe(false);
      expect(isInDentalPriorityScope("Z013", true)).toBe(false);
    });

    it("still includes the full K00–K14 range", () => {
      expect(isInDentalPriorityScope("K00", true)).toBe(true);
      expect(isInDentalPriorityScope("K074", true)).toBe(true);
      expect(isInDentalPriorityScope("K149", true)).toBe(true);
    });

    it("still excludes K15 and unrelated codes", () => {
      expect(isInDentalPriorityScope("K15", true)).toBe(false);
      expect(isInDentalPriorityScope("Z441", true)).toBe(false);
    });
  });
});
