// Client-side best-effort slug derived from the clinic name — the user is
// never asked for a slug directly (see task scope). bootstrap_clinic()
// re-normalizes it server-side with the same rules (lowercase,
// non-alphanumeric runs -> "-", trim leading/trailing "-") so this only
// needs to produce a *reasonable* candidate, not a guaranteed-final one.
const COMBINING_DIACRITICS_RE = /[̀-ͯ]/g;

export function slugifyClinicName(name: string): string {
  return name
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS_RE, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// clinics.slug is UNIQUE (see the bootstrap_clinic migration). Rather than
// checking availability up front, api.ts calls bootstrap_clinic with these
// candidates in order and only advances to the next one on an actual
// unique_violation from the database -- the DB stays the single source of
// truth for uniqueness.
export function slugCandidate(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}-${attempt + 1}`;
}
