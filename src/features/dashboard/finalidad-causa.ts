// The one confirmed regulatory Finalidad → Causa/Motivo relationship:
// Finalidad "VALORACION INTEGRAL PARA LA PROMOCION Y MANTENIMIENTO"
// requires Causa/Motivo "40". It depends on Finalidad only, never on the
// diagnosis (Z012 or otherwise). Any other Finalidad infers nothing.
export const PROMOTION_CAUSA_MOTIVO_CODE = "40";

type FinalidadOption = { code: string; label: string };

function normalize(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

export function isPromotionFinalidad(code: string, options: FinalidadOption[]): boolean {
  if (!code) return false;
  const option = options.find((o) => o.code === code);
  if (!option) return false;
  const label = normalize(option.label);
  return label.includes("VALORACION INTEGRAL") && label.includes("PROMOCION Y MANTENIMIENTO");
}

// Returns the causaMotivoCode a consultation should hold after its
// Finalidad changes. Selecting the promotion Finalidad sets 40; moving
// away from it clears a still-"40" Causa (never replaced by 38 or any
// other inferred value); everything else is preserved as-is.
export function resolveCausaOnFinalidadChange(input: {
  previousFinalidadCode: string;
  nextFinalidadCode: string;
  currentCausaMotivoCode: string;
  finalidadOptions: FinalidadOption[];
}): string {
  const { previousFinalidadCode, nextFinalidadCode, currentCausaMotivoCode, finalidadOptions } = input;
  if (isPromotionFinalidad(nextFinalidadCode, finalidadOptions)) return PROMOTION_CAUSA_MOTIVO_CODE;
  if (
    isPromotionFinalidad(previousFinalidadCode, finalidadOptions) &&
    currentCausaMotivoCode === PROMOTION_CAUSA_MOTIVO_CODE
  ) {
    return "";
  }
  return currentCausaMotivoCode;
}
