import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ClockIcon } from "@/components/shell/icons";
import { DURATION_OPTIONS, TIME_SLOTS } from "./schedule-config";

// Shared field/popover primitives used across real Odentia screens (every
// real modal/form's FIELD_CLASS, Agenda's AnchoredPopover/PopoverFieldRow/
// TimePopoverContent, the shared Combobox). They used to live inside the
// legacy MOCK appointment-detail-modal.tsx, which imports mock patients/
// appointments — so every real route pulled mock data into its module
// graph just to get a CSS class string. Moved here verbatim (no behavior
// change) so no real surface ever depends on a mock module; the legacy
// modal imports them back from here. Deliberately no "use client": server
// components import FIELD_CLASS too.

// The standard text input/select look for every real form in Odentia.
export const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none";

// Row shell for the two popover-driven fields (Fecha, Horario) — unlike
// the other fields' in-place editors, the value here always stays
// visible and the editor floats in a panel anchored to the trigger icon.
export function PopoverFieldRow({
  icon: Icon,
  triggerIcon: TriggerIcon,
  label,
  value,
  valueClassName = "",
  open,
  onToggle,
  onClose,
  popoverWidthClass,
  children,
}: {
  icon: typeof ClockIcon;
  triggerIcon: typeof ClockIcon;
  label: string;
  value: string;
  // Optional extra classes for the value text — e.g. the new-appointment
  // modal uses this to highlight a value pre-filled from a calendar slot
  // click in the brand's primary color until the user edits it.
  valueClassName?: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  popoverWidthClass?: string;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <dt className="text-[11px] text-label-foreground">{label}</dt>
          <button
            ref={triggerRef}
            type="button"
            onClick={onToggle}
            aria-label={`Editar ${label}`}
            aria-expanded={open}
            className="text-muted-foreground/50 hover:text-primary"
          >
            <TriggerIcon className="size-3" />
          </button>
        </div>
        <dd className={`text-sm font-medium break-words ${valueClassName}`}>{value}</dd>
      </div>
      <AnchoredPopover open={open} anchorRef={triggerRef} onClose={onClose} widthClass={popoverWidthClass}>
        {children}
      </AnchoredPopover>
    </div>
  );
}

// Positions a floating panel just below (or above, if that runs off-screen)
// the given anchor element, clamped to stay fully within the viewport, and
// closes on any click/tap outside itself and the anchor. Exported so other
// features (e.g. the Agenda's filter chips) can reuse the same positioning.
export function AnchoredPopover({
  open,
  anchorRef,
  onClose,
  widthClass = "w-64",
  matchAnchorWidth = false,
  className,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  widthClass?: string;
  // Tracks the anchor's own measured width instead of widthClass — for a
  // picker like Combobox, whose dropdown must stay exactly as wide as its
  // trigger regardless of where it's placed.
  matchAnchorWidth?: boolean;
  // Full override for the panel's own visual classes (default: a plain
  // bordered/shadowed/padded card). `fixed z-30` — the actual escape-
  // clipping/stacking mechanism — always applies underneath this and is
  // never overridable, so a caller only ever replaces cosmetics, never
  // the positioning behavior itself.
  className?: string;
  children: ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width?: number } | null>(null);
  const MARGIN = 8;
  const GAP = 6;

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const width = matchAnchorWidth ? anchorRect.width : undefined;

    let top = anchorRect.bottom + GAP;
    if (top + popoverRect.height + MARGIN > window.innerHeight) {
      top = anchorRect.top - popoverRect.height - GAP;
    }
    top = Math.min(Math.max(top, MARGIN), window.innerHeight - popoverRect.height - MARGIN);

    const left = Math.min(
      Math.max(anchorRect.left, MARGIN),
      window.innerWidth - (width ?? popoverRect.width) - MARGIN,
    );

    setPosition({ top, left, ...(width !== undefined ? { width } : {}) });
  }, [open, anchorRef, matchAnchorWidth]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      style={position ?? { top: 0, left: -9999 }}
      className={`fixed z-30 ${className ?? `${widthClass} rounded-lg border border-border bg-background p-3 shadow-lg`}`}
    >
      {children}
    </div>
  );
}

export function TimePopoverContent({
  time,
  durationMinutes,
  isSlotDisabled,
  slots = TIME_SLOTS,
  onSave,
  onCancel,
}: {
  time: string;
  durationMinutes: number;
  // Optional, additive — omitted by every mock/demo consumer of this file,
  // so their rendered options are byte-for-byte unchanged. Only the real
  // Agenda screens (real-new-appointment-modal.tsx,
  // real-appointment-detail-modal.tsx) pass it, to gray out/disable past
  // time slots per the single real "no past appointments" rule (see
  // real-format.ts's isPastSlot/isPastDayKey) without a second copy of
  // this picker's markup.
  isSlotDisabled?: (slot: string) => boolean;
  // Optional, additive — defaults to the hardcoded TIME_SLOTS, so every
  // mock/demo consumer renders byte-for-byte unchanged. Only the real
  // Agenda screens pass the professional's ACTUAL configured hours for the
  // day in question (agenda-hours.ts's resolveAgendaHoursForDay), fixing
  // the bug where a professional_availability block past 18:00 never
  // showed up as a selectable time here.
  slots?: string[];
  onSave: (patch: { time: string; durationMinutes: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [localTime, setLocalTime] = useState(time);
  const [localDuration, setLocalDuration] = useState(durationMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // `time` (and so `localTime`'s initial value) can already be a disabled
  // slot — real-new-appointment-modal.tsx falls back to the clinic's first
  // slot while no time has been chosen yet, which is often already past
  // for "today". An <option disabled> only blocks picking it FROM the
  // dropdown; it doesn't stop this button from confirming whatever value
  // is already selected. Gating Guardar on the same isSlotDisabled check
  // closes that gap without a second past/future comparison.
  const localTimeDisabled = isSlotDisabled?.(localTime) ?? false;

  const handleSaveClick = async () => {
    setSaving(true);
    setError(false);
    try {
      await onSave({ time: localTime, durationMinutes: localDuration });
    } catch {
      setError(true);
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="text-[11px] text-label-foreground" htmlFor="time-popover-start">
          Hora de inicio
        </label>
        <select
          id="time-popover-start"
          value={localTime}
          onChange={(e) => setLocalTime(e.target.value)}
          className={`${FIELD_CLASS} mt-1`}
        >
          {slots.map((slot) => (
            <option key={slot} value={slot} disabled={isSlotDisabled?.(slot)}>
              {slot}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[11px] text-label-foreground" htmlFor="time-popover-duration">
          Duración
        </label>
        <select
          id="time-popover-duration"
          value={localDuration}
          onChange={(e) => setLocalDuration(Number(e.target.value))}
          className={`${FIELD_CLASS} mt-1`}
        >
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} min
            </option>
          ))}
        </select>
      </div>
      {localTimeDisabled && (
        <p className="text-[11px] text-danger">Elige un horario que no haya pasado.</p>
      )}
      {error && <p className="text-[11px] text-danger">No se pudo guardar. Inténtalo de nuevo.</p>}
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={saving || localTimeDisabled}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
