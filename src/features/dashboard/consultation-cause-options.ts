// "Causa o motivo de la consulta" (DT1 causaMotivoAtencion, official
// catalog RIPSCausaExternaVersion2 — 29 rows, already loaded client-side)
// as a searchable list instead of a long flat <select>. Pure ordering/
// search helpers only: every official option stays, with its official code
// and label untouched, and nothing is ever selected or inferred here.

type CauseOption = { code: string; label: string };

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

// Frequent in dentistry — matched by the OFFICIAL label of whatever the
// loaded catalog contains (same label-based approach as finalidad-causa.ts's
// isPromotionFinalidad), never a hardcoded code: an option that isn't in
// the catalog simply never gets marked.
export function isFrequentDentalCause(option: CauseOption): boolean {
  const label = normalize(option.label);
  if (label === "ENFERMEDAD GENERAL") return true;
  return label.includes("PROMOCION Y MANTENIMIENTO") && label.includes("INDIVIDUAL");
}

// Frequent causes first, then everything else — each option exactly once,
// catalog order preserved within both groups. Never filters anything out.
export function orderCauseOptions<T extends CauseOption>(options: T[]): T[] {
  return [...options.filter(isFrequentDentalCause), ...options.filter((o) => !isFrequentDentalCause(o))];
}

// What the Combobox searches (it lowercases both sides): code + official
// label + an accent-free copy, so "promocion" finds "PROMOCIÓN" and a code
// like "38" works too.
export function causeOptionSearchText(option: CauseOption): string {
  return `${option.code} ${option.label} ${normalize(option.label)}`;
}
