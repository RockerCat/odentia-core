import { describe, expect, it } from "vitest";
import { dedupeBrowseSections } from "./code-search-autocomplete";

// Regression coverage for Prompt Ninja "selector CIE-10 Frecuentes →
// Odontología → Todos" — dedupeBrowseSections is the one new piece of
// pure logic this task adds (everything else touching Supabase, e.g.
// searchDiagnoses's own dentalOnly/offset query building, stays
// untested at the unit level — same convention as every other
// Supabase-coupled function in this codebase, e.g.
// fetchFrequentDiagnosesForCurrentClinic). This pins the priority order
// (Frecuentes > Odontología > Todos) the component's own render relies
// on, without mounting it.

type Row = { code: string; description: string };

function row(code: string): Row {
  return { code, description: `desc ${code}` };
}

describe("dedupeBrowseSections", () => {
  it("passes three empty sections through unchanged (no frequent, no browse fetched yet)", () => {
    expect(dedupeBrowseSections<Row>([[], [], []])).toEqual([[], [], []]);
  });

  it("empty Frecuentes never affects Odontología/Todos (empty-focus sin frecuentes)", () => {
    const dental = [row("K021"), row("K040")];
    const all = [row("A000"), row("K021")];
    const [frequent, dentalOut, allOut] = dedupeBrowseSections<Row>([[], dental, all]);
    expect(frequent).toEqual([]);
    expect(dentalOut).toEqual(dental);
    // K021 already appeared in dental (which comes before "all" in
    // priority order) — dropped from "all", A000 unaffected.
    expect(allOut).toEqual([row("A000")]);
  });

  it("with no overlaps at all, every section stays fully intact (empty-focus con frecuentes)", () => {
    const frequent = [row("Z012")];
    const dental = [row("K021")];
    const all = [row("A000")];
    expect(dedupeBrowseSections<Row>([frequent, dental, all])).toEqual([frequent, dental, all]);
  });

  it("a code in Frecuentes is removed from Odontología when it also appears there", () => {
    const frequent = [row("K021")];
    const dental = [row("K021"), row("K040")];
    const all = [row("A000")];
    const [, dentalOut] = dedupeBrowseSections<Row>([frequent, dental, all]);
    expect(dentalOut).toEqual([row("K040")]);
  });

  it("a code in Frecuentes is removed from Todos when it also appears there", () => {
    const frequent = [row("K021")];
    const dental = [row("K040")];
    const all = [row("K021"), row("A000")];
    const [, , allOut] = dedupeBrowseSections<Row>([frequent, dental, all]);
    expect(allOut).toEqual([row("A000")]);
  });

  it("a code in Odontología is removed from Todos, even when it is absent from Frecuentes", () => {
    const frequent: Row[] = [];
    const dental = [row("K021")];
    const all = [row("K021"), row("A000")];
    const [, , allOut] = dedupeBrowseSections<Row>([frequent, dental, all]);
    expect(allOut).toEqual([row("A000")]);
  });

  it("a code present in all three sections survives only in Frecuentes, the highest-priority one", () => {
    const frequent = [row("K021")];
    const dental = [row("K021")];
    const all = [row("K021")];
    const [frequentOut, dentalOut, allOut] = dedupeBrowseSections<Row>([frequent, dental, all]);
    expect(frequentOut).toEqual([row("K021")]);
    expect(dentalOut).toEqual([]);
    expect(allOut).toEqual([]);
  });

  it("never reorders items within a section — only filters", () => {
    const all = [row("Z999"), row("A000"), row("M100")];
    const [, , allOut] = dedupeBrowseSections<Row>([[], [], all]);
    expect(allOut.map((r) => r.code)).toEqual(["Z999", "A000", "M100"]);
  });

  // Prompt Ninja "búsqueda CIE-10 dental-first con expansión explícita" —
  // typed search's own two-section case ("Resultados de odontología" >
  // "Todos los diagnósticos", after explicit expansion). Same function,
  // just called with 2 sections instead of 3 — pinned separately since
  // this is the shape the component's own handleExpandSearch actually
  // uses.
  describe("typed-search dental-first expansion (2 sections)", () => {
    it("a code already shown in Resultados de odontología never repeats in Todos los diagnósticos", () => {
      const dental = [row("K074")];
      const general = [row("K074"), row("J00")];
      const [dentalOut, generalOut] = dedupeBrowseSections<Row>([dental, general]);
      expect(dentalOut).toEqual([row("K074")]);
      expect(generalOut).toEqual([row("J00")]);
    });

    it("no overlap: both sections stay fully intact", () => {
      const dental = [row("K074")];
      const general = [row("J00"), row("Z44.1")];
      expect(dedupeBrowseSections<Row>([dental, general])).toEqual([dental, general]);
    });

    it("empty dental results never block the general section from showing its own matches", () => {
      const dental: Row[] = [];
      const general = [row("Z44.1")];
      const [dentalOut, generalOut] = dedupeBrowseSections<Row>([dental, general]);
      expect(dentalOut).toEqual([]);
      expect(generalOut).toEqual([row("Z44.1")]);
    });
  });

  // Prompt Ninja "priorizar Z012 + K00–K14 en selector odontológico" —
  // empty focus's own 4-section case (Frecuentes > Examen odontológico
  // (pinned) > Odontología > Todos). Render order itself (Z012 shown
  // above K00–K14 regardless of code order) is a component-render
  // concern, not dedupeBrowseSections's job — this only pins the
  // priority/removal rule.
  describe("empty-focus pinned Z012 (4 sections: Frecuentes > pinned > Odontología > Todos)", () => {
    it("Z012 already in Frecuentes is removed from the pinned section", () => {
      const frequent = [row("Z012")];
      const pinned = [row("Z012")];
      const [frequentOut, pinnedOut] = dedupeBrowseSections<Row>([frequent, pinned, [], []]);
      expect(frequentOut).toEqual([row("Z012")]);
      expect(pinnedOut).toEqual([]);
    });

    it("Z012 in the pinned section is removed from Todos when it also appears there", () => {
      const pinned = [row("Z012")];
      const all = [row("Z012"), row("A000")];
      const [, pinnedOut, , allOut] = dedupeBrowseSections<Row>([[], pinned, [], all]);
      expect(pinnedOut).toEqual([row("Z012")]);
      expect(allOut).toEqual([row("A000")]);
    });

    it("Z012 in the pinned section is removed from Odontología too, if it somehow also appeared there", () => {
      const pinned = [row("Z012")];
      const narrowed = [row("Z012"), row("K021")];
      const [, pinnedOut, narrowedOut] = dedupeBrowseSections<Row>([[], pinned, narrowed, []]);
      expect(pinnedOut).toEqual([row("Z012")]);
      expect(narrowedOut).toEqual([row("K021")]);
    });

    it("no overlap at all: every section stays fully intact", () => {
      const frequent = [row("K074")];
      const pinned = [row("Z012")];
      const narrowed = [row("K021")];
      const all = [row("A000")];
      expect(dedupeBrowseSections<Row>([frequent, pinned, narrowed, all])).toEqual([frequent, pinned, narrowed, all]);
    });
  });
});
