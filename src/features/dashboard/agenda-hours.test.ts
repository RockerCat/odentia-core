import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasAvailableFutureSlotForDay,
  isoWeekdayOfDayKey,
  mergeOccupiedSlotMinutes,
  resolveAgendaSlotMinutesForDay,
  resolveAgendaSlotsForDay,
  type AgendaAvailabilityBlock,
} from "./agenda-hours";
import { CLINIC_HOURS, generateTimeSlots } from "./schedule-config";

// Bug: "disponibilidad guardada hasta 22:00 pero Agenda sólo genera slots
// hasta 17:30" — SECOND PASS. The first fix computed one continuous
// [earliest start, latest end] range rounded to whole hours. Both were
// wrong: real professional_availability blocks must stay as real,
// possibly-gapped blocks (never a continuous envelope), and never rounded
// (see agenda-hours.ts's own header comment for the full explanation).

const PROFESSIONAL = "prof-alex";
const SATURDAY = 6; // ISO 8601: 1=Lunes..7=Domingo
const SUNDAY = 7;

function block(overrides: Partial<AgendaAvailabilityBlock> = {}): AgendaAvailabilityBlock {
  return {
    professionalProfileId: PROFESSIONAL,
    dayOfWeek: SATURDAY,
    startTime: "08:00",
    endTime: "22:00",
    active: true,
    ...overrides,
  };
}

describe("isoWeekdayOfDayKey", () => {
  it("resolves sábado 12 de septiembre de 2026 to ISO weekday 6", () => {
    expect(isoWeekdayOfDayKey("2026-09-12")).toBe(SATURDAY);
  });

  it("resolves domingo 13 de septiembre de 2026 to ISO weekday 7", () => {
    expect(isoWeekdayOfDayKey("2026-09-13")).toBe(SUNDAY);
  });
});

describe("resolveAgendaSlotsForDay — real blocks, no envelope, no rounding", () => {
  it("1. 08:00–22:00 → último inicio válido 21:30 (nunca 17:30, nunca 22:00)", () => {
    const slots = resolveAgendaSlotsForDay({
      dayOfWeek: SATURDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [block({ startTime: "08:00", endTime: "22:00" })],
    });
    expect(slots[0]).toBe("8:00 AM");
    expect(slots[slots.length - 1]).toBe("9:30 PM");
    expect(slots).not.toContain("10:00 PM");
  });

  it("2. 08:30–17:30 → arranca en 08:30 (nunca inventa 08:00) y el último inicio es 17:00 (nunca extiende a 17:30)", () => {
    const slots = resolveAgendaSlotsForDay({
      dayOfWeek: SATURDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [block({ startTime: "08:30", endTime: "17:30" })],
    });
    expect(slots[0]).toBe("8:30 AM");
    expect(slots).not.toContain("8:00 AM");
    expect(slots[slots.length - 1]).toBe("5:00 PM");
    expect(slots).not.toContain("5:30 PM");
  });

  it("3. 08:00–12:00 + 14:00–18:00 → ningún slot 12:00–13:30 es agendable (el hueco se preserva, nunca un rango continuo)", () => {
    const slots = resolveAgendaSlotsForDay({
      dayOfWeek: SATURDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [
        block({ startTime: "08:00", endTime: "12:00" }),
        block({ startTime: "14:00", endTime: "18:00" }),
      ],
    });
    expect(slots).not.toEqual(expect.arrayContaining(["12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM"]));
    // The real edges of each block stay exactly where configured.
    expect(slots).toContain("11:30 AM"); // last slot of the morning block
    expect(slots).toContain("2:00 PM"); // first slot of the afternoon block
    expect(slots).toContain("5:30 PM"); // last slot of the afternoon block
    expect(slots).not.toContain("6:00 PM");
  });

  it("4. bloques solapados no duplican slots", () => {
    const slots = resolveAgendaSlotsForDay({
      dayOfWeek: SATURDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [
        block({ startTime: "08:00", endTime: "12:00" }),
        block({ startTime: "10:00", endTime: "14:00" }), // overlaps 10:00–12:00
      ],
    });
    const count = (label: string) => slots.filter((s) => s === label).length;
    expect(count("10:00 AM")).toBe(1);
    expect(count("11:00 AM")).toBe(1);
    // Chronological order preserved.
    expect(slots).toEqual([...slots].sort((a, b) => slots.indexOf(a) - slots.indexOf(b)));
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("otro día (domingo) sin bloque propio produce CERO slots — nunca inventa fallback cuando el profesional SÍ tiene configuración (solo no para ese día)", () => {
    // Same professional HAS configuration (Saturday) — Sunday, with no
    // block of its own, must stay empty, never the initial schedule.
    const slots = resolveAgendaSlotsForDay({
      dayOfWeek: SUNDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [block()],
    });
    expect(slots).toEqual([]);
  });

  it("sin ninguna fila, aplica el horario inicial Lun–Vie 08:00–17:00 — jueves con slots, sábado/domingo sin slots (nunca el viejo Lun–Dom 08:00–18:00)", () => {
    const thursday = resolveAgendaSlotsForDay({ dayOfWeek: 4, professionalProfileIds: [PROFESSIONAL], availability: [] });
    expect(thursday).toEqual(generateTimeSlots({ startHour: 8, endHour: 17, intervalMinutes: CLINIC_HOURS.intervalMinutes }));
    expect(thursday[0]).toBe("8:00 AM");
    expect(thursday.at(-1)).toBe("4:30 PM");
    expect(resolveAgendaSlotsForDay({ dayOfWeek: SATURDAY, professionalProfileIds: [PROFESSIONAL], availability: [] })).toEqual([]);
    expect(resolveAgendaSlotsForDay({ dayOfWeek: SUNDAY, professionalProfileIds: [PROFESSIONAL], availability: [] })).toEqual([]);
  });

  it("el horario inicial sembrado como filas reales produce exactamente los mismos slots que el fallback sin filas", () => {
    for (let day = 1; day <= 7; day++) {
      const seeded = [1, 2, 3, 4, 5].map((d) => block({ dayOfWeek: d, startTime: "08:00", endTime: "17:00" }));
      expect(resolveAgendaSlotsForDay({ dayOfWeek: day, professionalProfileIds: [PROFESSIONAL], availability: seeded })).toEqual(
        resolveAgendaSlotsForDay({ dayOfWeek: day, professionalProfileIds: [PROFESSIONAL], availability: [] }),
      );
    }
  });

  it("no cae al horario inicial cuando el único bloque de ese día está inactivo, si el profesional tiene otras filas configuradas (deliberadamente sin horario hoy)", () => {
    const slots = resolveAgendaSlotsForDay({
      dayOfWeek: SATURDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [
        block({ dayOfWeek: 1, startTime: "08:00", endTime: "17:00" }), // Lunes, configured
        block({ active: false }), // Sábado, deliberately deactivated
      ],
    });
    expect(slots).toEqual([]);
  });

  it("aplica el horario inicial a un profesional sin filas aunque OTRO profesional sí tenga configuración", () => {
    const slots = resolveAgendaSlotsForDay({
      dayOfWeek: 1,
      professionalProfileIds: ["someone-never-configured"],
      availability: [block()], // belongs to a DIFFERENT professional
    });
    expect(slots[0]).toBe("8:00 AM");
    expect(slots.at(-1)).toBe("4:30 PM");
  });

  it("une correctamente varios profesionales mostrados a la vez: uno con bloque real y otro sin configuración (fallback) — cada uno resuelto de forma independiente", () => {
    const slots = resolveAgendaSlotsForDay({
      dayOfWeek: 1,
      professionalProfileIds: [PROFESSIONAL, "never-configured"],
      availability: [block({ dayOfWeek: 1, startTime: "20:00", endTime: "22:00" })],
    });
    // The union includes the fallback's own 08:00 start (from the
    // never-configured professional) AND the real 20:00–21:30 slots.
    expect(slots).toContain("8:00 AM");
    expect(slots).toContain("9:30 PM");
  });
});

describe("mergeOccupiedSlotMinutes", () => {
  it("11. una cita existente que cae fuera de la disponibilidad real (p.ej. tras acortarla) sigue apareciendo — nunca queda oculta", () => {
    const availableMinutes = resolveAgendaSlotMinutesForDay({
      dayOfWeek: SATURDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [block({ startTime: "09:00", endTime: "13:00" })],
    });
    const occupiedAt14 = 14 * 60; // 2:00 PM — outside the 09:00–13:00 block
    const merged = mergeOccupiedSlotMinutes(availableMinutes, [occupiedAt14]);
    expect(merged).toContain("2:00 PM");
    expect(merged).toContain("9:00 AM"); // real availability itself untouched
  });

  it("no duplica un slot que ya está disponible Y ocupado a la vez", () => {
    const availableMinutes = resolveAgendaSlotMinutesForDay({
      dayOfWeek: SATURDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [block({ startTime: "09:00", endTime: "13:00" })],
    });
    const merged = mergeOccupiedSlotMinutes(availableMinutes, [9 * 60]);
    expect(merged.filter((s) => s === "9:00 AM").length).toBe(1);
  });
});

// Same convention as no-past-appointments.test.ts: vi.setSystemTime with a
// Date built via LOCAL component setters (never a UTC-offset ISO string) —
// isPastSlot (which this all ultimately calls into) reads the local
// machine clock via local Date getters, same "the machine running this is
// already in the clinic's time zone" assumption the rest of this feature
// already makes. This keeps the test deterministic regardless of the
// actual host time zone, exactly like that existing file's own
// "afterClosing" case.
describe("hasAvailableFutureSlotForDay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("5. hoy 19:01 con disponibilidad hasta 22:00 → true (existen 19:30, 20:00, etc.)", () => {
    vi.setSystemTime(new Date(2026, 8, 12, 19, 1)); // sábado 12/09/2026, 7:01 PM local
    const result = hasAvailableFutureSlotForDay({
      dayKey: "2026-09-12",
      dayOfWeek: SATURDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [block({ startTime: "08:00", endTime: "22:00" })],
    });
    expect(result).toBe(true);
  });

  it("6. hoy después del último slot real (22:05, cierre 22:00) → false", () => {
    vi.setSystemTime(new Date(2026, 8, 12, 22, 5));
    const result = hasAvailableFutureSlotForDay({
      dayKey: "2026-09-12",
      dayOfWeek: SATURDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [block({ startTime: "08:00", endTime: "22:00" })],
    });
    expect(result).toBe(false);
  });

  it("nunca inventa disponibilidad futura en un día explícitamente sin bloque (aunque el profesional sí tenga configuración otros días)", () => {
    vi.setSystemTime(new Date(2026, 8, 13, 8, 0)); // domingo temprano
    const result = hasAvailableFutureSlotForDay({
      dayKey: "2026-09-13",
      dayOfWeek: SUNDAY,
      professionalProfileIds: [PROFESSIONAL],
      availability: [block()], // only configured for Saturday
    });
    expect(result).toBe(false);
  });
});
