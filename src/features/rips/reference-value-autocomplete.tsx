"use client";

import { useEffect, useRef, useState } from "react";
import { FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";
import { searchReferenceValuesAction } from "./actions";
import type { ReferenceValue } from "./catalog-data";

// Search-as-you-type picker for a large reference catalog (today: only
// Municipio, 1,124 rows — see this task's Performance section for why
// this exists instead of a plain <select> with every option). Shows human
// labels only ("Tunja — Boyacá"), never a raw code, in keeping with this
// task's own product principle; the caller is the one who receives
// `value` (the code) on selection and is responsible for storing it.
export function ReferenceValueAutocomplete({
  catalogKey,
  value,
  displayLabel,
  onChange,
  placeholder,
  disabled,
}: {
  catalogKey: string;
  value: string;
  // The label to show for the currently-selected code before the user
  // starts typing again — resolved by the caller (it already has this
  // from its own initial data fetch), never re-derived here.
  displayLabel: string;
  onChange: (value: ReferenceValue | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  // No separate "closed" query state to keep in sync with displayLabel —
  // the input just shows displayLabel until the user actually starts
  // typing (open flips to true on the very first change), which sidesteps
  // ever needing an effect to reconcile the two.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReferenceValue[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open || trimmedQuery.length < 2) return;
    const id = ++requestId.current;
    const timeout = setTimeout(async () => {
      setLoading(true);
      const values = await searchReferenceValuesAction(catalogKey, trimmedQuery);
      if (requestId.current === id) {
        setResults(values);
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [trimmedQuery, open, catalogKey]);

  const visibleResults = trimmedQuery.length < 2 ? [] : results;

  return (
    <div className="relative">
      <input
        value={open ? query : displayLabel}
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
          // Delay so a click on a result (which also blurs the input)
          // registers before the list disappears.
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
                {r.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
