import { describe, expect, it } from "vitest";
import { dateKeyOf, formatTimeLabel, slotStartIso } from "./real-format";
import { TIME_SLOTS } from "./schedule-config";

// Solicitud de Cita crosses a surface boundary that nothing else in the app
// does: the Patient Portal writes a preferred instant from a (dayKey, slot)
// pair (request-appointment-scheduler.tsx → slotStartIso), and the clinic's
// own acceptance modal reads that instant back OUT to a (dayKey, slot) pair
// to prefill the Agenda's pickers with it (real-appointment-requests-card.tsx's
// preferredSlot → dateKeyOf + formatTimeLabel).
//
// Those are three independent formatters (a hand-rolled parser, a manual
// date-key builder, and Intl.DateTimeFormat with es-CO/hour12 quirks), so
// the round trip is a real invariant worth pinning: if it ever breaks, the
// clinic silently sees "Selecciona un horario" instead of what the patient
// actually asked for — and could accept a different time without noticing
// the preference was dropped.
describe("preferred-slot round trip (Portal writes → Agenda reads back)", () => {
  const DAY_KEYS = [
    "2026-01-05", // Monday, single-digit month and day
    "2026-06-15",
    "2026-09-08",
    "2026-12-31", // year boundary
  ];

  for (const dayKey of DAY_KEYS) {
    it(`preserves the day and every clinic slot for ${dayKey}`, () => {
      for (const slot of TIME_SLOTS) {
        const iso = slotStartIso(dayKey, slot);
        expect(dateKeyOf(iso)).toBe(dayKey);
        // Must land back on a value the Agenda's own pickers accept — an
        // exact TIME_SLOTS member, not merely a similar-looking string.
        expect(formatTimeLabel(iso)).toBe(slot);
        expect(TIME_SLOTS).toContain(formatTimeLabel(iso));
      }
    });
  }

  it("covers noon and midnight-adjacent formatting, the classic hour12 traps", () => {
    // 12:00 PM must stay "12:00 PM", never "0:00 PM" — the modulo-12 parse
    // and Intl's own 12-hour rendering have to agree on it.
    expect(formatTimeLabel(slotStartIso("2026-06-15", "12:00 PM"))).toBe("12:00 PM");
    expect(formatTimeLabel(slotStartIso("2026-06-15", "12:30 PM"))).toBe("12:30 PM");
  });
});
