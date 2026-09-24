import { describe, expect, it } from "vitest";
import { describeDefaultSchedule, resolveAgendaSlotMinutesForDay, usesDefaultSchedule, type AgendaAvailabilityBlock } from "./agenda-hours";
import { resolveScheduleSetupAlert } from "./schedule-setup-alert";
import { CLINIC_HOURS, generateTimeSlots } from "./schedule-config";

// Pilot E2E: a new clinic reached Agenda with no explicit schedule and no
// guidance, while Configuración's empty state + add-block form read like a
// configured Monday. Agenda's alert and Configuración's "Usando horario
// predeterminado" must both derive from the SAME Case A predicate/default
// the slot resolver itself uses.

const ANA = { professionalProfileId: "prof-ana", firstName: "Ana", lastName: "Ruiz" };
const LUIS = { professionalProfileId: "prof-luis", firstName: "Luis", lastName: "Gómez" };

function block(overrides: Partial<AgendaAvailabilityBlock> = {}): AgendaAvailabilityBlock {
  return { professionalProfileId: ANA.professionalProfileId, dayOfWeek: 1, startTime: "09:00", endTime: "13:00", active: true, ...overrides };
}

describe("default schedule — single source shared by Agenda and Configuración", () => {
  it("usesDefaultSchedule is true only with zero rows for that professional", () => {
    expect(usesDefaultSchedule(ANA.professionalProfileId, [])).toBe(true);
    expect(usesDefaultSchedule(ANA.professionalProfileId, [block({ professionalProfileId: LUIS.professionalProfileId })])).toBe(true);
    expect(usesDefaultSchedule(ANA.professionalProfileId, [block()])).toBe(false);
    // All-inactive is Case C (deliberately configured), never "default".
    expect(usesDefaultSchedule(ANA.professionalProfileId, [block({ active: false })])).toBe(false);
  });

  it("describes exactly the CLINIC_HOURS range the resolver falls back to, every day", () => {
    expect(describeDefaultSchedule()).toBe("Todos los días · 8:00 AM – 6:00 PM");
    const [first] = generateTimeSlots();
    expect(describeDefaultSchedule()).toContain(first);
    for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek++) {
      const minutes = resolveAgendaSlotMinutesForDay({ dayOfWeek, professionalProfileIds: [ANA.professionalProfileId], availability: [] });
      expect(minutes[0]).toBe(CLINIC_HOURS.startHour * 60);
      expect(minutes.at(-1)).toBe(CLINIC_HOURS.endHour * 60 - CLINIC_HOURS.intervalMinutes);
    }
  });

  it("follows a changed fallback instead of a hardcoded label", () => {
    expect(describeDefaultSchedule({ startHour: 7, endHour: 13, intervalMinutes: 30 })).toBe("Todos los días · 7:00 AM – 1:00 PM");
  });
});

describe("resolveScheduleSetupAlert", () => {
  it("shows for a Clinic Admin when her solo professional has no schedule (no names needed)", () => {
    expect(resolveScheduleSetupAlert("clinic_admin", [ANA], [])).toEqual({ professionalNames: [] });
  });

  it("disappears once the professional has an explicit schedule", () => {
    expect(resolveScheduleSetupAlert("clinic_admin", [ANA], [block()])).toBeNull();
    expect(resolveScheduleSetupAlert("clinic_admin", [ANA], [block({ active: false })])).toBeNull();
  });

  it("names only the professionals still on the default in a multi-professional clinic", () => {
    expect(resolveScheduleSetupAlert("clinic_admin", [ANA, LUIS], [block()])).toEqual({ professionalNames: ["Luis Gómez"] });
    expect(resolveScheduleSetupAlert("clinic_admin", [ANA, LUIS], [block(), block({ professionalProfileId: LUIS.professionalProfileId })])).toBeNull();
  });

  it("never offers the administrative CTA to a role that can't configure the clinic", () => {
    expect(resolveScheduleSetupAlert("dentist", [ANA], [])).toBeNull();
    expect(resolveScheduleSetupAlert("assistant", [ANA], [])).toBeNull();
  });

  it("stays quiet with no clinical professionals (Nueva cita's own empty state covers that)", () => {
    expect(resolveScheduleSetupAlert("clinic_admin", [], [])).toBeNull();
  });
});
