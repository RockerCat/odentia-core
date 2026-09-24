import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeInitialSchedule, hasInitialSchedule, hasNoAvailabilityRows, type AgendaAvailabilityBlock } from "./agenda-hours";
import {
  dismissInitialScheduleNotice,
  initialScheduleNoticeStorageKey,
  isInitialScheduleNoticeDismissed,
  resolveInitialScheduleNotice,
} from "./initial-schedule-notice";

// Pilot E2E: every professional starts with a real Lun–Vie 08:00–17:00
// schedule, so Agenda's notice is informative ("Tu horario inicial está
// listo"), never a "configure or else" warning, and closable.

const ANA = { professionalProfileId: "prof-ana", firstName: "Ana", lastName: "Ruiz" };
const LUIS = { professionalProfileId: "prof-luis", firstName: "Luis", lastName: "Gómez" };

function block(overrides: Partial<AgendaAvailabilityBlock> = {}): AgendaAvailabilityBlock {
  return { professionalProfileId: ANA.professionalProfileId, dayOfWeek: 1, startTime: "08:00", endTime: "17:00", active: true, ...overrides };
}

function initialWeek(professionalProfileId = ANA.professionalProfileId): AgendaAvailabilityBlock[] {
  return [1, 2, 3, 4, 5].map((dayOfWeek) => block({ professionalProfileId, dayOfWeek }));
}

describe("initial schedule predicates", () => {
  it("describes the canonical initial schedule", () => {
    expect(describeInitialSchedule()).toBe("Lunes a viernes · 8:00 AM – 5:00 PM");
  });

  it("hasNoAvailabilityRows only for zero rows of that professional (all-inactive is configured)", () => {
    expect(hasNoAvailabilityRows(ANA.professionalProfileId, [])).toBe(true);
    expect(hasNoAvailabilityRows(ANA.professionalProfileId, [block({ professionalProfileId: LUIS.professionalProfileId })])).toBe(true);
    expect(hasNoAvailabilityRows(ANA.professionalProfileId, [block({ active: false })])).toBe(false);
  });

  it("hasInitialSchedule: seeded Lun–Vie (or zero rows) yes; any real edit no", () => {
    expect(hasInitialSchedule(ANA.professionalProfileId, initialWeek())).toBe(true);
    expect(hasInitialSchedule(ANA.professionalProfileId, initialWeek().map((b) => ({ ...b, startTime: "08:00:00", endTime: "17:00:00" })))).toBe(true);
    expect(hasInitialSchedule(ANA.professionalProfileId, [])).toBe(true);
    // Lunes-only (the pilot's leftover state) is an explicit configuration.
    expect(hasInitialSchedule(ANA.professionalProfileId, [block()])).toBe(false);
    expect(hasInitialSchedule(ANA.professionalProfileId, [...initialWeek(), block({ dayOfWeek: 6 })])).toBe(false);
    expect(hasInitialSchedule(ANA.professionalProfileId, initialWeek().map((b) => (b.dayOfWeek === 1 ? { ...b, endTime: "13:00" } : b)))).toBe(false);
    expect(hasInitialSchedule(ANA.professionalProfileId, initialWeek().map((b) => (b.dayOfWeek === 3 ? { ...b, active: false } : b)))).toBe(false);
  });
});

describe("resolveInitialScheduleNotice", () => {
  it("shows for a Clinic Admin whose solo professional still has the initial schedule", () => {
    expect(resolveInitialScheduleNotice("clinic_admin", [ANA], initialWeek())).toEqual({ professionalNames: [] });
  });

  it("disappears once the schedule has been edited", () => {
    expect(resolveInitialScheduleNotice("clinic_admin", [ANA], [...initialWeek(), block({ dayOfWeek: 6, startTime: "09:00", endTime: "12:00" })])).toBeNull();
  });

  it("names only the professionals still on the initial schedule in a multi-professional clinic", () => {
    expect(resolveInitialScheduleNotice("clinic_admin", [ANA, LUIS], [...initialWeek(), block({ professionalProfileId: LUIS.professionalProfileId })])).toEqual({
      professionalNames: ["Ana Ruiz"],
    });
  });

  it("never shows to a role that can't edit the clinic's schedules", () => {
    expect(resolveInitialScheduleNotice("dentist", [ANA], initialWeek())).toBeNull();
    expect(resolveInitialScheduleNotice("assistant", [ANA], initialWeek())).toBeNull();
  });

  it("stays quiet with no clinical professionals", () => {
    expect(resolveInitialScheduleNotice("clinic_admin", [], [])).toBeNull();
  });
});

describe("dismiss persistence (per-browser localStorage, scoped per clinic)", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("closing persists for that clinic only — survives a reload (fresh read of storage)", () => {
    expect(isInitialScheduleNoticeDismissed("clinic-a")).toBe(false);
    dismissInitialScheduleNotice("clinic-a");
    expect(store.get(initialScheduleNoticeStorageKey("clinic-a"))).toBe("1");
    expect(isInitialScheduleNoticeDismissed("clinic-a")).toBe(true);
    expect(isInitialScheduleNoticeDismissed("clinic-b")).toBe(false);
  });

  it("still hides for this page view when storage throws, and reads fail toward not-dismissed", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(isInitialScheduleNoticeDismissed("clinic-c")).toBe(false);
    dismissInitialScheduleNotice("clinic-c");
    expect(isInitialScheduleNoticeDismissed("clinic-c")).toBe(true);
  });
});
