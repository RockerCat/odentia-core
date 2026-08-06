import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  // Default: hover-capable devices only (mouse/trackpad), gated in CSS via
  // (hover: hover) so a touch tap never triggers or flashes it, even if a
  // browser synthesizes a hover-ish event on first tap. Pass true to also
  // let a tap open it as a popover on touch devices (tap again, or tap
  // outside, to dismiss) — for spots where the anchor itself is
  // interactive and touch users have no hover to preview with otherwise.
  tapToOpen?: boolean;
  // When provided (and there's room, i.e. on wider/desktop viewports),
  // position just outside this element's right edge instead of
  // above/below the anchor — e.g. so a tooltip inside a panel can sit
  // clearly outside a surrounding container rather than overlapping
  // sibling content. Falls back to the element's left edge if the right
  // doesn't fit, then to the normal anchor-relative placement if neither
  // does (narrow viewports, where there's no "outside" to speak of).
  positionOutsideRef?: RefObject<HTMLElement | null>;
  // Visual style — "dark" (default) matches the existing tooltip used
  // elsewhere in the app; "light" is a soft, on-brand tinted card.
  variant?: "dark" | "light";
};

const VIEWPORT_MARGIN = 8;
const GAP = 8;
const OUTSIDE_MIN_VIEWPORT_WIDTH = 640; // matches Tailwind's `sm:` breakpoint

const VARIANT_CLASS = {
  dark: "bg-foreground text-background shadow-lg",
  light: "border border-primary/15 bg-primary/10 text-foreground shadow-md",
};

export function Tooltip({
  content,
  children,
  tapToOpen = false,
  positionOutsideRef,
  variant = "dark",
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    // anchorRef itself is `display: contents` and has no box of its own
    // (getBoundingClientRect on it is always zeroed) — measure its actual
    // child instead.
    const anchor = anchorRef.current?.firstElementChild;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    const boundary =
      positionOutsideRef?.current && window.innerWidth >= OUTSIDE_MIN_VIEWPORT_WIDTH
        ? positionOutsideRef.current.getBoundingClientRect()
        : null;

    if (boundary) {
      // Track the anchor vertically so it still reads as "belonging" to
      // that row despite sitting outside the boundary horizontally.
      let top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;
      top = Math.min(
        Math.max(top, VIEWPORT_MARGIN),
        window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN,
      );

      let left = boundary.right + GAP;
      if (left + tooltipRect.width + VIEWPORT_MARGIN > window.innerWidth) {
        left = boundary.left - GAP - tooltipRect.width;
      }
      left = Math.min(
        Math.max(left, VIEWPORT_MARGIN),
        window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN,
      );

      setPosition({ top, left });
      return;
    }

    // Prefer above the anchor; flip below if that would run off-screen.
    let top = anchorRect.top - tooltipRect.height - GAP;
    if (top < VIEWPORT_MARGIN) {
      top = anchorRect.bottom + GAP;
    }

    let left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
    left = Math.min(
      Math.max(left, VIEWPORT_MARGIN),
      window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN,
    );

    setPosition({ top, left });
  }, [open, positionOutsideRef]);

  // Intervenes on the raw touch event (not the click it would otherwise
  // synthesize) — preventDefault here reliably suppresses that synthetic
  // click across browsers, which a capture-phase click handler cannot do
  // consistently. A tap reveals the popover instead of immediately firing
  // the anchor's own action, mirroring what hover already does for mouse
  // users; tapping again (or outside) dismisses it.
  const handleTouchEndCapture = (e: React.TouchEvent) => {
    if (!tapToOpen) return;
    e.preventDefault();
    setOpen((prev) => !prev);
  };

  return (
    <span
      ref={anchorRef}
      className="contents"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onTouchEndCapture={tapToOpen ? handleTouchEndCapture : undefined}
    >
      {children}
      {open && (
        <>
          {tapToOpen && (
            <span
              aria-hidden="true"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 [@media(hover:hover)]:hidden"
            />
          )}
          <span
            ref={tooltipRef}
            role="tooltip"
            style={position ?? { top: 0, left: -9999 }}
            className={`pointer-events-none fixed z-50 max-w-[240px] rounded-lg px-3 py-2 text-xs leading-snug ${VARIANT_CLASS[variant]} ${
              tapToOpen ? "block" : "hidden [@media(hover:hover)]:block"
            }`}
          >
            {content}
          </span>
        </>
      )}
    </span>
  );
}
