import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { replaceBlock, updateAvailabilityBlockHours, validateBlockRange, type WeeklyAvailabilityBlock } from "./availability-data";

// "Editar" a schedule block: an UPDATE of that one row's start/end only
// (never delete+insert), under the same RLS as toggle/delete.

type Result = { data: unknown; error: unknown };

function mockSupabase(result: Result) {
  const calls: { table?: string; update?: unknown; eq?: [string, unknown]; select?: string } = {};
  const chain = {
    update: vi.fn((payload: unknown) => {
      calls.update = payload;
      return chain;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      calls.eq = [col, val];
      return chain;
    }),
    select: vi.fn((cols: string) => {
      calls.select = cols;
      return chain;
    }),
    single: vi.fn(async () => result),
  };
  const supabase = {
    from: vi.fn((table: string) => {
      calls.table = table;
      return chain;
    }),
  } as unknown as SupabaseClient;
  return { supabase, calls, chain };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "blk-lunes",
    clinic_id: "clinic-1",
    professional_profile_id: "prof-1",
    day_of_week: 1,
    start_time: "09:00:00",
    end_time: "18:00:00",
    active: true,
    ...overrides,
  };
}

function block(dayOfWeek: number, overrides: Partial<WeeklyAvailabilityBlock> = {}): WeeklyAvailabilityBlock {
  return {
    id: `blk-${dayOfWeek}`,
    clinicId: "clinic-1",
    professionalProfileId: "prof-1",
    dayOfWeek,
    startTime: "08:00",
    endTime: "17:00",
    active: true,
    ...overrides,
  };
}

describe("updateAvailabilityBlockHours", () => {
  it("08:00–17:00 → 09:00–18:00 updates ONLY start/end of that one row, by id", async () => {
    const { supabase, calls } = mockSupabase({ data: row(), error: null });
    const outcome = await updateAvailabilityBlockHours(supabase, "blk-lunes", { startTime: "09:00", endTime: "18:00" });
    expect(calls.table).toBe("professional_availability");
    expect(calls.update).toEqual({ start_time: "09:00", end_time: "18:00" }); // no day/active/clinic/professional
    expect(calls.eq).toEqual(["id", "blk-lunes"]);
    expect(outcome).toEqual({
      status: "ok",
      block: { id: "blk-lunes", clinicId: "clinic-1", professionalProfileId: "prof-1", dayOfWeek: 1, startTime: "09:00", endTime: "18:00", active: true },
    });
  });

  it("keeps an inactive block inactive — the DB row's own flag comes back untouched", async () => {
    const { supabase } = mockSupabase({ data: row({ active: false }), error: null });
    const outcome = await updateAvailabilityBlockHours(supabase, "blk-lunes", { startTime: "09:00", endTime: "18:00" });
    expect(outcome.status === "ok" && outcome.block.active).toBe(false);
  });

  it.each([
    ["09:00", "09:00"],
    ["18:00", "09:00"],
    ["", "17:00"],
  ])("start %s / end %s is rejected before touching the DB (same rule as Agregar bloque)", async (startTime, endTime) => {
    const { supabase } = mockSupabase({ data: row(), error: null });
    const outcome = await updateAvailabilityBlockHours(supabase, "blk-lunes", { startTime, endTime });
    expect(outcome).toEqual({ status: "error", message: "La hora de fin debe ser posterior a la hora de inicio." });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("a row RLS filtered out (0 rows) or a DB error is an honest failure, never a fake save", async () => {
    const denied = mockSupabase({ data: null, error: { code: "PGRST116", message: "0 rows" } });
    expect((await updateAvailabilityBlockHours(denied.supabase, "blk-other-clinic", { startTime: "09:00", endTime: "17:00" })).status).toBe("error");
    const checkViolation = mockSupabase({ data: null, error: { code: "23514", message: "time_range_check" } });
    expect((await updateAvailabilityBlockHours(checkViolation.supabase, "blk-lunes", { startTime: "09:00", endTime: "17:00" })).status).toBe("error");
  });
});

describe("replaceBlock", () => {
  it("swaps only the edited block; every other day stays byte-identical", () => {
    const week = [1, 2, 3, 4, 5].map((d) => block(d));
    const next = replaceBlock(week, { ...week[0], startTime: "09:00", endTime: "18:00" });
    expect(next[0]).toMatchObject({ id: "blk-1", startTime: "09:00", endTime: "18:00" });
    expect(next.slice(1)).toEqual(week.slice(1));
    expect(next.slice(1).every((b, i) => b === week[i + 1])).toBe(true);
  });

  it("cancel = never calling replaceBlock: the list is the original reference", () => {
    const week = [1, 2].map((d) => block(d));
    expect(replaceBlock(week, { ...block(9), id: "unknown" })).toEqual(week);
  });
});

describe("validateBlockRange (shared with Agregar bloque)", () => {
  it("accepts a real range and rejects start >= end", () => {
    expect(validateBlockRange("09:00", "18:00")).toBeNull();
    expect(validateBlockRange("17:00", "08:00")).not.toBeNull();
  });
});
