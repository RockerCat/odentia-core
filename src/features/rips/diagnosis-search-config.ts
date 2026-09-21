import { browseDiagnosesAction, fetchExamenOdontologicoAction, fetchFrequentDiagnosesAction, searchDiagnosesAction } from "./actions";

// Shared CIE-10 CodeSearchAutocomplete config — Prompt Ninja "selector
// CIE-10 Frecuentes → Odontología → Todos", then "priorizar Z012 + K00–K14
// en selector odontológico", then "búsqueda CIE-10 dental-first con
// expansión explícita". Originally defined only inside
// real-clinical-encounter-screen.tsx; extracted here, unchanged, so the
// historical principal-diagnosis correction surface (Historia Clínica →
// Atenciones / /rips, see CompleteEncounterPrincipalDiagnosisModal) can
// reuse the EXACT same dental-first search/browse behavior instead of a
// second, drifting copy — "no duplicar reglas regulatorias
// innecesariamente."

// Prompt Ninja discoverability gap — diagnoses THIS clinic has actually
// used, resolved entirely server-side by fetchFrequentDiagnosesAction()
// (clinicId comes from the caller's own session, never a parameter
// here). A "no-history"/"unauthorized" result both fall back to the same
// empty list — the component's own emptyHint covers "nothing to show
// yet", never an error state.
export const DIAGNOSIS_INITIAL_SUGGESTIONS = {
  label: "Usados en esta clínica",
  emptyHint: "Busca por código o descripción para consultar el catálogo CIE-10.",
  fetch: async () => {
    const result = await fetchFrequentDiagnosesAction();
    return result.status === "ok" ? result.diagnoses : [];
  },
};

// Prompt Ninja "selector CIE-10 Frecuentes → Odontología → Todos" — the
// next step of the same discoverability gap DIAGNOSIS_INITIAL_SUGGESTIONS
// above addresses: a brand-new clinic with zero Frecuentes used to hit a
// real dead end (emptyHint text, nothing clickable). These two sections
// are always available (never gated on Frecuentes existing) and never
// hide the full catalog — Odontología narrows to whatever
// public.diagnosis_dental_scope currently contains (see that migration's
// own header comment on why that's a UX priority list, never a
// regulatory whitelist) ONLY as a navigation convenience; Todos always
// stays reachable underneath it. Must match browseDiagnosesAction's own
// DIAGNOSIS_BROWSE_PAGE_SIZE.
export const DIAGNOSIS_BROWSE_PAGE_SIZE = 50;
// Prompt Ninja "priorizar Z012 + K00–K14 en selector odontológico" —
// `pinned` puts "Examen odontológico" (Z012) above the Odontología
// browse, resolved from the real catalog (fetchExamenOdontologicoAction →
// findDiagnosisByCode), never fabricated inline; empty result (Z012 not
// found active) simply renders nothing for this section, same as any
// other empty browse page. This is a pinning/ordering UX decision about
// ONE code, independent of (and unchanged by) whatever
// diagnosis_dental_scope's own broader membership currently is — see
// "scope odontológico CIE-10 versionado" (that migration) for the
// conservative initial seed ({Z012} ∪ active K00–K14), never the broader
// ~135-code Bogotá SDS list from a separate, still-unconfirmed-provenance
// audit.
export const DIAGNOSIS_BROWSE_SECTIONS = {
  pinned: {
    label: "Examen odontológico",
    fetch: fetchExamenOdontologicoAction,
  },
  narrowed: {
    label: "Odontología",
    hint: "CIE-10 de cavidad oral, dientes, estructuras de soporte, glándulas salivales y maxilares.",
    pageSize: DIAGNOSIS_BROWSE_PAGE_SIZE,
    fetchPage: (offset: number) => browseDiagnosesAction({ offset, dentalOnly: true }),
  },
  all: {
    label: "Todos los diagnósticos",
    pageSize: DIAGNOSIS_BROWSE_PAGE_SIZE,
    fetchPage: (offset: number) => browseDiagnosesAction({ offset, dentalOnly: false }),
  },
};

// Prompt Ninja "búsqueda CIE-10 dental-first con expansión explícita",
// then "priorizar Z012 + K00–K14 en selector odontológico", then "scope
// odontológico CIE-10 versionado" — typed search's own dental-first
// pass: the SAME searchDiagnosesAction every general search already
// uses, with dentalOnly:true — since Z012 is itself a seeded member of
// public.diagnosis_dental_scope, typing e.g. "examen" surfaces it
// directly inside "Resultados de odontología" with no separate flag
// needed (never a separate pinned section for typed search — that's an
// empty-focus-only concept, see DIAGNOSIS_BROWSE_SECTIONS.pinned above).
// Plain searchDiagnosesAction (general) stays the one the "Buscar
// también en todos los diagnósticos" click falls back to — this is what
// keeps a noisy term like "ajuste" from ever reaching the artificial-limb/
// eye fitting codes until the professional explicitly asks to widen.
export function searchDentalDiagnosesAction(query: string) {
  return searchDiagnosesAction(query, { dentalOnly: true });
}
