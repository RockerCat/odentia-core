// RIPS #A4 — "Servicios RIPS por especialidad" (/clinica#rips): pure
// merge of three independent reads (relevant specialties, this clinic's
// CONFIRMED config, Odentia's global SUGGESTIONS) into one per-specialty
// view model the UI renders directly. Pure — no Supabase import, same
// "testable without the screen" convention as clinical-service-resolution.ts/
// export-readiness.ts.
//
// The one rule this module exists to enforce structurally: a suggestion
// can NEVER be read as if it were a confirmation. `confirmed` always wins
// when both exist for the same specialty; a suggestion only ever
// surfaces on a specialty this clinic has NOT confirmed yet, and always
// as `"pending-with-suggestion"` — a status distinct from `"confirmed"`
// by construction, never a shared boolean a caller could misread.

export type RelevantSpecialty = { id: string; name: string };

export type ConfirmedSpecialtyRipsService = {
  specialtyId: string;
  grupoServiciosCode: string;
  codServicioCode: string;
};

export type SuggestedSpecialtyRipsService = {
  specialtyId: string;
  grupoServiciosCode: string;
  codServicioCode: string;
};

export type SpecialtyRipsServiceStatus = "confirmed" | "pending-with-suggestion" | "pending-no-suggestion";

export type SpecialtyRipsServiceRow = {
  specialtyId: string;
  specialtyName: string;
  status: SpecialtyRipsServiceStatus;
  // Populated only when status === "confirmed" — this clinic's own
  // effective configuration.
  confirmedGrupoCode: string | null;
  confirmedServicioCode: string | null;
  // Populated only when status === "pending-with-suggestion" — Odentia's
  // suggestion, shown for context/preselection ONLY, never persisted
  // until the admin explicitly confirms it.
  suggestedGrupoCode: string | null;
  suggestedServicioCode: string | null;
};

export function buildSpecialtyRipsServiceRows(input: {
  specialties: RelevantSpecialty[];
  confirmed: ConfirmedSpecialtyRipsService[];
  suggestions: SuggestedSpecialtyRipsService[];
}): SpecialtyRipsServiceRow[] {
  const confirmedBySpecialtyId = new Map(input.confirmed.map((c) => [c.specialtyId, c]));
  const suggestionBySpecialtyId = new Map(input.suggestions.map((s) => [s.specialtyId, s]));

  return input.specialties.map((specialty) => {
    const confirmed = confirmedBySpecialtyId.get(specialty.id);
    if (confirmed) {
      return {
        specialtyId: specialty.id,
        specialtyName: specialty.name,
        status: "confirmed" as const,
        confirmedGrupoCode: confirmed.grupoServiciosCode,
        confirmedServicioCode: confirmed.codServicioCode,
        suggestedGrupoCode: null,
        suggestedServicioCode: null,
      };
    }

    const suggestion = suggestionBySpecialtyId.get(specialty.id);
    if (suggestion) {
      return {
        specialtyId: specialty.id,
        specialtyName: specialty.name,
        status: "pending-with-suggestion" as const,
        confirmedGrupoCode: null,
        confirmedServicioCode: null,
        suggestedGrupoCode: suggestion.grupoServiciosCode,
        suggestedServicioCode: suggestion.codServicioCode,
      };
    }

    return {
      specialtyId: specialty.id,
      specialtyName: specialty.name,
      status: "pending-no-suggestion" as const,
      confirmedGrupoCode: null,
      confirmedServicioCode: null,
      suggestedGrupoCode: null,
      suggestedServicioCode: null,
    };
  });
}
