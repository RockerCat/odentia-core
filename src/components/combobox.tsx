"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon, SearchIcon } from "@/components/shell/icons";
import { AnchoredPopover, FIELD_CLASS } from "@/features/dashboard/appointment-detail-modal";

// Shared searchable single-select — collapsed to just a search field until
// it gains focus or the user types, opening a dropdown of live-filtered
// results (closes automatically on pick). Once something is selected it
// collapses again into a "card" showing that selection — clicking the card
// re-opens the search to change it. Originally built for new-appointment-
// modal.tsx's Paciente/Profesional/Consultorio fields; extracted here so any
// other picker in Odentia (see e.g. ProfessionalSelect) reuses the exact
// same component instead of a second implementation of the same pattern.
export function Combobox<T>({
  items,
  getKey,
  getSearchText,
  selectedItem,
  onSelect,
  renderItem,
  placeholder,
  emptyText,
  // Lets a caller shrink the closed "card" button to match a shorter
  // control it sits next to (e.g. ProfessionalSelect's compactTrigger,
  // matched to a native <select>'s own px-2.5 py-1.5) without touching
  // every other Combobox consumer's own card sizing.
  triggerClassName = "px-3 py-2",
}: {
  items: T[];
  getKey: (item: T) => string;
  getSearchText: (item: T) => string;
  selectedItem: T | null;
  onSelect: (item: T) => void;
  // isCard: true when rendering the collapsed "selected" card, false for a
  // row inside the open dropdown — lets callers style them differently
  // (e.g. highlighting a calendar-prefilled selection only on its card).
  renderItem: (item: T, isCard: boolean) => ReactNode;
  placeholder: string;
  emptyText: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  // The search input is present in the DOM whenever `open` can be true
  // (see the ternary below), so it doubles as AnchoredPopover's anchor —
  // that's what lets the dropdown escape this modal/card's own
  // overflow-hidden/scroll clipping and repaint above a sticky footer,
  // instead of the plain `absolute` positioning this used before.
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const filtered = items.filter((item) =>
    getSearchText(item).toLowerCase().includes(query.trim().toLowerCase()),
  );

  const handleSelect = (item: T) => {
    onSelect(item);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      {selectedItem && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex w-full items-center gap-2.5 rounded-lg border border-border ${triggerClassName} text-left transition-colors hover:border-primary/40`}
        >
          {renderItem(selectedItem, true)}
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={`${FIELD_CLASS} pl-8`}
          />
        </div>
      )}

      <AnchoredPopover
        open={open}
        anchorRef={inputRef}
        onClose={() => setOpen(false)}
        matchAnchorWidth
        className="max-h-44 overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((item) => {
              const key = getKey(item);
              const active = selectedItem ? getKey(selectedItem) === key : false;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      active ? "bg-primary/10" : "hover:bg-foreground/5"
                    }`}
                  >
                    {renderItem(item, false)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </AnchoredPopover>
    </div>
  );
}
