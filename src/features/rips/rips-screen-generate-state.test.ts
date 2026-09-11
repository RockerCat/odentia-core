import { describe, expect, it } from "vitest";
import { getRipsGenerateState } from "./rips-screen";

// Regression coverage for "PROMPT NINJA — Corregir estado 'Listo para
// generar' cuando el período no tiene atenciones": the ONE function both
// the banner text and the Generar RIPS button's disabled= now derive
// from — so "Listo para generar" and a clickable button can never
// disagree again.
describe("getRipsGenerateState", () => {
  it("is 'blockers' when readiness is not ready, regardless of encounter count", () => {
    expect(getRipsGenerateState(false, 5)).toBe("blockers");
    expect(getRipsGenerateState(false, 0)).toBe("blockers");
    expect(getRipsGenerateState(undefined, 5)).toBe("blockers");
  });

  it("is 'empty-period' when readiness is ready but there are 0 atenciones — a valid empty state, never a blocker", () => {
    expect(getRipsGenerateState(true, 0)).toBe("empty-period");
    expect(getRipsGenerateState(true, undefined)).toBe("empty-period");
  });

  it("is 'ready' only when readiness is ready AND at least one atención exists", () => {
    expect(getRipsGenerateState(true, 1)).toBe("ready");
    expect(getRipsGenerateState(true, 42)).toBe("ready");
  });

  it("never returns 'ready' with 0 atenciones — the exact bug this task fixes", () => {
    expect(getRipsGenerateState(true, 0)).not.toBe("ready");
  });
});
