import { hasAvailableFutureSlot } from "./real-format";
import type { WeekDay } from "./real-week";

// Shared by both real Agenda modals (real-new-appointment-modal.tsx,
// real-appointment-detail-modal.tsx) — deliberately NOT a reuse of the mock
// appointment-detail-modal.tsx's CalendarPopoverContent, which hardcodes a
// fixed REFERENCE_MONTH (August 2026) and plots every selectable day at
// that month's day-of-month position: correct only for the one demo week
// it was built for, silently wrong for any real week spanning a different
// month (starting the very next week after this was written). Functionally
// this replicates the mock's own real behavior exactly, minus the
// non-functional month-navigation chrome: CalendarPopoverContent's prev/
// next-month arrows never actually let you select a day outside the
// original 7 `weekDays` either (`disabled={!match}` only matches those 7),
// so a real appointment can only be moved within the week already on
// screen in both versions — this is a faithful port, not a feature cut.
export function WeekDayPickerContent({
  weekDays,
  currentDayKey,
  onSelect,
}: {
  weekDays: WeekDay[];
  currentDayKey: string;
  onSelect: (dayKey: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {weekDays.map((day) => {
        const active = day.key === currentDayKey;
        // Same disabled-state classes as the board's own past-slot cells
        // (real-appointments-board.tsx) — not a new visual treatment.
        // hasAvailableFutureSlot, not isPastDayKey: a calendar-day-only
        // check would still let "today" be picked with zero selectable
        // hours left (e.g. 5:25 PM, clinic closes 6 PM but every slot up
        // to then already passed) — see that helper's own comment.
        const past = !hasAvailableFutureSlot(day.key);
        return (
          <button
            key={day.key}
            type="button"
            disabled={past}
            aria-disabled={past}
            onClick={() => onSelect(day.key)}
            className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
              past
                ? "cursor-not-allowed border-border/60 text-muted-foreground/30"
                : active
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border hover:bg-foreground/5"
            }`}
          >
            <span className="text-[10px] uppercase">{day.shortLabel}</span>
            <span>{day.dateNumber}</span>
          </button>
        );
      })}
    </div>
  );
}
