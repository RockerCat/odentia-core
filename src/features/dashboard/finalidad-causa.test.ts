import { describe, expect, it } from "vitest";
import { isPromotionFinalidad, resolveCausaOnFinalidadChange } from "./finalidad-causa";

const options = [
  { code: "10", label: "VALORACION INTEGRAL PARA LA PROMOCION Y MANTENIMIENTO" },
  { code: "15", label: "DETECCION TEMPRANA DE ENFERMEDAD GENERAL" },
];

const change = (previousFinalidadCode: string, nextFinalidadCode: string, currentCausaMotivoCode: string) =>
  resolveCausaOnFinalidadChange({ previousFinalidadCode, nextFinalidadCode, currentCausaMotivoCode, finalidadOptions: options });

describe("Finalidad → Causa/Motivo", () => {
  it("recognizes the promotion Finalidad by label, accent-insensitively", () => {
    expect(isPromotionFinalidad("10", options)).toBe(true);
    expect(isPromotionFinalidad("10", [{ code: "10", label: "Valoración integral para la promoción y mantenimiento" }])).toBe(true);
    expect(isPromotionFinalidad("15", options)).toBe(false);
    expect(isPromotionFinalidad("", options)).toBe(false);
  });

  it("promotion Finalidad resolves Causa 40, regardless of any diagnosis", () => {
    expect(change("", "10", "")).toBe("40");
  });

  it("an unrelated Finalidad never infers 40 (or any Causa)", () => {
    expect(change("", "15", "")).toBe("");
  });

  it("changing away clears an auto-derived 40 without inferring 38", () => {
    expect(change("10", "15", "40")).toBe("");
  });

  it("changing away preserves a different manual Causa", () => {
    expect(change("10", "15", "38")).toBe("38");
    expect(change("", "15", "38")).toBe("38");
  });
});
