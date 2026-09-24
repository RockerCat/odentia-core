"use client";

import { useEffect, useRef, useState } from "react";
import { FIELD_CLASS } from "@/features/dashboard/form-primitives";

export type CodeSearchResult = { code: string; description: string };

// Pure — de-duplicates by `code` across the three sequentially-
// prioritized empty-focus sections (Frecuentes > Odontología > Todos,
// see BrowseSections below): a code already shown in an earlier section
// is dropped from every later one, never the other way around. Never
// touches server-side pagination/offsets — this is purely how the
// already-fetched pages are composed for display (per this task's own
// scope: "no alterar el dataset server-side solo para resolver esto").
// Extracted so this ordering rule is unit-testable without mounting the
// component, same convention as this codebase's other pure UI-decision
// helpers (e.g. rankFrequentDiagnosisCodes).
export function dedupeBrowseSections<T extends CodeSearchResult>(sections: T[][]): T[][] {
  const seen = new Set<string>();
  return sections.map((section) =>
    section.filter((item) => {
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    }),
  );
}

type BrowseSectionConfig<T> = {
  label: string;
  // Optional small helper text under the label (e.g. what "Odontología"
  // means) — never phrased as a recommendation/suggestion, purely
  // catalog navigation (see this task's own Clinical Safety section).
  hint?: string;
  fetchPage: (offset: number) => Promise<T[]>;
  // Must match the caller's server action's own page size — used only to
  // tell "that was a full page, there may be more" apart from "that was
  // the last page" (see code-search-autocomplete's own comment on
  // DIAGNOSIS_BROWSE_PAGE_SIZE in actions.ts).
  pageSize: number;
};

type BrowseSectionState<T> = {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
};

function emptyBrowseState<T>(): BrowseSectionState<T> {
  return { items: [], loading: false, loadingMore: false, hasMore: true };
}

// Shared search-as-you-type picker for CUPS and CIE-10 (RIPS #4, Section
// 5/7) — the dentist searches by code OR description ("890304" or
// "consulta de control"), never memorizes a code, and the code shows only
// as secondary information next to the human description ("890304 —
// Consulta de control..."), per this task's own product principle.
// Generic over `search`, so this same component backs both catalogs
// without a second, near-identical implementation for each. Generic over
// `T` (not just the plain {code, description} shape) so a caller that
// needs a catalog field beyond the display pair — e.g. CUPS's own
// rips_service_type, which drives the consultation/procedure badge and
// must come from the real catalog, never inferred — gets it back on
// `onChange` without a second round-trip lookup.
//
// `initialSuggestions` (optional, off by default — CUPS never passes it,
// so its own behavior below is byte-for-byte unchanged) is the one small,
// explicit opt-in for RIPS #A3's diagnosis-discoverability gap: when the
// field is focused and still empty (nothing typed yet), fetch and show a
// short, labeled list instead of nothing. Fetched once per focus, never
// on every keystroke, and never in a loop with the real search — the two
// branches below (`trimmedQuery.length < 2` vs `>= 2`) are mutually
// exclusive. Selecting one of these still goes through the exact same
// `onChange` as a real search result — it is a discovery aid, never an
// auto-selection.
//
// `browse` (optional, off by default — CUPS never passes it either) is
// this same discoverability idea's next step (Prompt Ninja "selector
// CIE-10 Frecuentes → Odontología → Todos"): empty-focus sections below
// Frecuentes — an optional single pinned row (Diagnóstico's own "Examen
// odontológico", Z012 — see `pinned` below), a narrowed one ("Odontología",
// the official WHO CIE-10 K00–K14 block), and the full catalog ("Todos
// los diagnósticos") — the latter two server-paginated (never the full
// ~12,634-row catalog reaching the client) with an explicit "Cargar más"
// per section, no infinite scroll, no virtualization. Selecting a row
// from any of them still goes through the exact same `onChange` as
// search/Frecuentes — always an explicit click, never auto-selected,
// never ranked by clinical relevance.
//
// `dentalSearch` (optional, off by default — CUPS never passes it) is
// browse's own dental-first idea applied to TYPED search too (Prompt
// Ninja "búsqueda CIE-10 dental-first con expansión explícita"): typing
// searches ONLY K00–K14 first ("Resultados de odontología"), never the
// full catalog, with an explicit "Buscar también en todos los
// diagnósticos" action the professional must click before `search`
// (the general catalog) ever runs — this is what stops a noisy term
// like "ajuste" from immediately surfacing an unrelated result (e.g. an
// artificial-leg fitting code) before the professional asks for it.
// `search` keeps meaning exactly what it always has (the general/full
// catalog) — CUPS still uses it directly and unconditionally, unaffected
// by this prop existing on the type.
export function CodeSearchAutocomplete<T extends CodeSearchResult>({
  value,
  displayDescription,
  search,
  onChange,
  placeholder,
  disabled,
  initialSuggestions,
  browse,
  dentalSearch,
}: {
  value: string;
  // The description to show for the currently-selected code before the
  // user starts typing again — resolved by the caller, never re-derived
  // here (same convention as ReferenceValueAutocomplete's displayLabel).
  displayDescription: string;
  search: (query: string) => Promise<T[]>;
  onChange: (value: T | null) => void;
  placeholder?: string;
  disabled?: boolean;
  initialSuggestions?: {
    // Shown above the list when it has at least one item (e.g. "Usados en
    // esta clínica") — omit for no heading.
    label?: string;
    // Shown instead of the list when it comes back empty AND no `browse`
    // is configured — a hint, never an error ("Sin resultados." stays
    // reserved for a real, typed search with zero matches, below). With
    // `browse` configured, this dead end never renders: Odontología/
    // Todos always give the user something navigable instead.
    emptyHint: string;
    fetch: () => Promise<T[]>;
  };
  browse?: {
    // Optional, off by default (Prompt Ninja "priorizar Z012 + K00–K14
    // en selector odontológico") — a single, non-paginated, explicitly
    // prioritized row shown ABOVE `narrowed` regardless of code order
    // (Frecuentes > pinned > narrowed > all, same dedup priority the
    // render below follows). `fetch` resolves through the real catalog
    // (findDiagnosisByCode) and fails closed to []; there's no "Cargar
    // más" for it — it's one fixed lookup, not a browsable page.
    pinned?: {
      label: string;
      fetch: () => Promise<T[]>;
    };
    narrowed: BrowseSectionConfig<T>;
    all: BrowseSectionConfig<T>;
  };
  // When present, typed search (≥2 chars) uses THIS instead of `search` —
  // `search` is only reached afterward, on the explicit "Buscar también
  // en todos los diagnósticos" click. Same query, same debounce, same
  // limit contract as `search` — just a narrower filter server-side.
  dentalSearch?: (query: string) => Promise<T[]>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<T[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [narrowedState, setNarrowedState] = useState<BrowseSectionState<T>>(emptyBrowseState);
  const [allState, setAllState] = useState<BrowseSectionState<T>>(emptyBrowseState);
  // `browse.pinned` — a single fixed lookup, never paginated, so no
  // `hasMore`/loadingMore needed, unlike narrowedState/allState above.
  const [pinnedResults, setPinnedResults] = useState<T[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);
  // Explicit expansion to the general catalog, typed-search only (see
  // `dentalSearch` above). `expandedQuery` — not a plain boolean — is
  // what the query text ITSELF was at the moment "Buscar también en
  // todos los diagnósticos" was clicked; `isExpanded` below compares it
  // against the CURRENT `trimmedQuery`, so a changed query naturally
  // stops being "expanded" the moment it changes, with no explicit reset
  // needed anywhere (an effect must never call setState synchronously in
  // its own body just to reset state for a new render — see
  // react-hooks/set-state-in-effect — deriving it during render instead
  // avoids that entirely).
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<T[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const requestId = useRef(0);
  const suggestionsRequestId = useRef(0);
  const pinnedRequestId = useRef(0);
  const narrowedRequestId = useRef(0);
  const allRequestId = useRef(0);
  const expandedRequestId = useRef(0);
  const trimmedQuery = query.trim();
  const isExpanded = expandedQuery === trimmedQuery;

  useEffect(() => {
    if (!open || trimmedQuery.length < 2) return;
    const id = ++requestId.current;
    const timeout = setTimeout(async () => {
      setLoading(true);
      const values = await (dentalSearch ?? search)(trimmedQuery);
      if (requestId.current === id) {
        setResults(values);
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [trimmedQuery, open, search, dentalSearch]);

  const visibleResults = trimmedQuery.length < 2 ? [] : results;

  // Explicit "Buscar también en todos los diagnósticos" — never runs
  // automatically, and always searches the SAME `trimmedQuery` the dental
  // search just used (a real closure capture, not restated by the
  // caller). Stale-response protection mirrors every other request-id
  // ref in this component.
  const handleExpandSearch = () => {
    if (expandedLoading) return;
    setExpandedQuery(trimmedQuery);
    const id = ++expandedRequestId.current;
    setExpandedLoading(true);
    search(trimmedQuery).then((values) => {
      if (expandedRequestId.current === id) {
        setExpandedResults(values);
        setExpandedLoading(false);
      }
    });
  };
  // Stale expandedResults (from a query the user has since changed away
  // from) must never affect what's deduped OUT of the dental section —
  // isExpanded already guards the render below; this guards the dedup
  // computation the same way.
  const [visibleDentalResults, visibleExpandedResults] = dedupeBrowseSections([results, isExpanded ? expandedResults : []]);

  // "Cargar más" for each browse section — two separate handlers, not a
  // shared factory called during render (refs must only ever be read
  // inside an event handler's own body, never threaded through as a
  // plain function argument at render time — see react-hooks/refs).
  // Both guard against a double-click/concurrent request the same way
  // the request-id refs above guard focus re-fetches: a stale response
  // can never overwrite a newer one, and `loadingMore`/`loading` both
  // block a second request from firing while one is already in flight.
  const loadMoreNarrowed = () => {
    const config = browse?.narrowed;
    if (!config || narrowedState.loadingMore || narrowedState.loading) return;
    const id = ++narrowedRequestId.current;
    setNarrowedState((prev) => ({ ...prev, loadingMore: true }));
    config.fetchPage(narrowedState.items.length).then((page) => {
      if (narrowedRequestId.current !== id) return;
      setNarrowedState((prev) => ({
        items: [...prev.items, ...page],
        loading: false,
        loadingMore: false,
        hasMore: page.length >= config.pageSize,
      }));
    });
  };
  const loadMoreAll = () => {
    const config = browse?.all;
    if (!config || allState.loadingMore || allState.loading) return;
    const id = ++allRequestId.current;
    setAllState((prev) => ({ ...prev, loadingMore: true }));
    config.fetchPage(allState.items.length).then((page) => {
      if (allRequestId.current !== id) return;
      setAllState((prev) => ({
        items: [...prev.items, ...page],
        loading: false,
        loadingMore: false,
        hasMore: page.length >= config.pageSize,
      }));
    });
  };

  // Frecuentes > Examen odontológico (pinned) > Odontología > Todos —
  // same priority order as the render below, never the reverse (see
  // dedupeBrowseSections's own comment).
  const [visibleSuggestions, visiblePinned, visibleNarrowed, visibleAll] = dedupeBrowseSections([
    suggestions ?? [],
    pinnedResults,
    narrowedState.items,
    allState.items,
  ]);

  return (
    <div className="relative">
      <input
        value={open ? query : displayDescription}
        disabled={disabled}
        placeholder={placeholder}
        className={FIELD_CLASS}
        onFocus={() => {
          setQuery("");
          setOpen(true);
          if (initialSuggestions) {
            const id = ++suggestionsRequestId.current;
            setLoadingSuggestions(true);
            initialSuggestions.fetch().then((values) => {
              if (suggestionsRequestId.current === id) {
                setSuggestions(values);
                setLoadingSuggestions(false);
              }
            });
          }
          if (browse?.pinned) {
            const pId = ++pinnedRequestId.current;
            setPinnedLoading(true);
            browse.pinned.fetch().then((values) => {
              if (pinnedRequestId.current === pId) {
                setPinnedResults(values);
                setPinnedLoading(false);
              }
            });
          }
          if (browse) {
            const nId = ++narrowedRequestId.current;
            setNarrowedState({ items: [], loading: true, loadingMore: false, hasMore: true });
            browse.narrowed.fetchPage(0).then((page) => {
              if (narrowedRequestId.current === nId) {
                setNarrowedState({ items: page, loading: false, loadingMore: false, hasMore: page.length >= browse.narrowed.pageSize });
              }
            });
            const aId = ++allRequestId.current;
            setAllState({ items: [], loading: true, loadingMore: false, hasMore: true });
            browse.all.fetchPage(0).then((page) => {
              if (allRequestId.current === aId) {
                setAllState({ items: page, loading: false, loadingMore: false, hasMore: page.length >= browse.all.pageSize });
              }
            });
          }
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange(null);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && trimmedQuery.length < 2 && (initialSuggestions || browse) && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg">
          {initialSuggestions &&
            (loadingSuggestions ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
            ) : visibleSuggestions.length === 0 ? (
              // Only a dead end when there's nothing else to browse either
              // — with `browse` configured, Odontología/Todos below
              // always give the user something navigable instead.
              !browse && <p className="px-3 py-2 text-xs text-muted-foreground">{initialSuggestions.emptyHint}</p>
            ) : (
              <>
                {initialSuggestions.label && (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {initialSuggestions.label}
                  </p>
                )}
                {visibleSuggestions.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-foreground/5"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      onChange(r);
                    }}
                  >
                    <span className="text-muted-foreground">{r.code}</span> — {r.description}
                  </button>
                ))}
              </>
            ))}
          {browse?.pinned && (pinnedLoading || visiblePinned.length > 0) && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {browse.pinned.label}
              </p>
              {pinnedLoading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
              ) : (
                visiblePinned.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-foreground/5"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      onChange(r);
                    }}
                  >
                    <span className="text-muted-foreground">{r.code}</span> — {r.description}
                  </button>
                ))
              )}
            </>
          )}
          {browse && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {browse.narrowed.label}
              </p>
              {browse.narrowed.hint && <p className="px-3 pb-1 text-[11px] text-muted-foreground">{browse.narrowed.hint}</p>}
              {narrowedState.loading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
              ) : (
                visibleNarrowed.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-foreground/5"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      onChange(r);
                    }}
                  >
                    <span className="text-muted-foreground">{r.code}</span> — {r.description}
                  </button>
                ))
              )}
              {!narrowedState.loading && narrowedState.hasMore && (
                <button
                  type="button"
                  disabled={narrowedState.loadingMore}
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-primary hover:bg-foreground/5 disabled:opacity-60"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={loadMoreNarrowed}
                >
                  {narrowedState.loadingMore ? "Cargando…" : "Cargar más"}
                </button>
              )}

              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {browse.all.label}
              </p>
              {allState.loading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
              ) : (
                visibleAll.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-foreground/5"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      onChange(r);
                    }}
                  >
                    <span className="text-muted-foreground">{r.code}</span> — {r.description}
                  </button>
                ))
              )}
              {!allState.loading && allState.hasMore && (
                <button
                  type="button"
                  disabled={allState.loadingMore}
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-primary hover:bg-foreground/5 disabled:opacity-60"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={loadMoreAll}
                >
                  {allState.loadingMore ? "Cargando…" : "Cargar más"}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {open && trimmedQuery.length >= 2 && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg">
          {dentalSearch ? (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Resultados de odontología
              </p>
              {loading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
              ) : visibleDentalResults.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados en odontología.</p>
              ) : (
                visibleDentalResults.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-foreground/5"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      onChange(r);
                    }}
                  >
                    <span className="text-muted-foreground">{r.code}</span> — {r.description}
                  </button>
                ))
              )}
              {!isExpanded && (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-primary hover:bg-foreground/5"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleExpandSearch}
                >
                  Buscar también en todos los diagnósticos
                </button>
              )}
              {isExpanded && (
                <>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    Todos los diagnósticos
                  </p>
                  {expandedLoading ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
                  ) : visibleExpandedResults.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados.</p>
                  ) : (
                    visibleExpandedResults.map((r) => (
                      <button
                        key={r.code}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-foreground/5"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setOpen(false);
                          onChange(r);
                        }}
                      >
                        <span className="text-muted-foreground">{r.code}</span> — {r.description}
                      </button>
                    ))
                  )}
                </>
              )}
            </>
          ) : loading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
          ) : visibleResults.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados.</p>
          ) : (
            visibleResults.map((r) => (
              <button
                key={r.code}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-foreground/5"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  onChange(r);
                }}
              >
                <span className="text-muted-foreground">{r.code}</span> — {r.description}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
