"use client";

import { useEffect, useRef, useState } from "react";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";

export type CodeSearchResult = { code: string; description: string };

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
export function CodeSearchAutocomplete<T extends CodeSearchResult>({
  value,
  displayDescription,
  search,
  onChange,
  placeholder,
  disabled,
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
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open || trimmedQuery.length < 2) return;
    const id = ++requestId.current;
    const timeout = setTimeout(async () => {
      setLoading(true);
      const values = await search(trimmedQuery);
      if (requestId.current === id) {
        setResults(values);
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [trimmedQuery, open, search]);

  const visibleResults = trimmedQuery.length < 2 ? [] : results;

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
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange(null);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && trimmedQuery.length >= 2 && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg">
          {loading ? (
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
