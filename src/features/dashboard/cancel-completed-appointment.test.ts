import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "./appointments-data";
import { canCancelAppointment } from "./real-status";

// Pilot E2E: a "Completada" Cita still offered "Cancelar cita" (seen as
// Assistant, true for every role). completed → cancelled is never valid.

let currentStatus: AppointmentStatus = "confirmed";
let updateResult: { error: { code?: string; message?: string } | null } = { error: null };
const update = vi.fn(() => ({ eq: async () => updateResult }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      // updateAppointment's fresh read of the row's REAL current status.
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { clinic_id: "c1", professional_profile_id: "p1", starts_at: "2026-09-24T14:00:00Z", duration_minutes: 30, status: currentStatus },
            error: null,
          }),
        }),
      }),
      update,
    }),
  }),
}));

const { cancelAppointment, COMPLETED_CANCEL_ERROR } = await import("./appointments-actions");

const ROLES = ["clinic_admin", "dentist", "assistant"] as const;

describe("canCancelAppointment (UI)", () => {
  it.each(ROLES)("never offers Cancelar for a completed Cita — %s", (role) => {
    expect(canCancelAppointment("completed", role)).toBe(false);
  });

  it.each(["scheduled", "confirmed", "patient_arrived", "waiting_room"] as AppointmentStatus[])(
    "%s stays cancellable for every role (unchanged)",
    (status) => {
      for (const role of ROLES) expect(canCancelAppointment(status, role)).toBe(true);
    },
  );

  it("keeps the existing in_progress rule: Assistant no, Clinic Admin/Dentist yes", () => {
    expect(canCancelAppointment("in_progress", "assistant")).toBe(false);
    expect(canCancelAppointment("in_progress", "clinic_admin")).toBe(true);
    expect(canCancelAppointment("in_progress", "dentist")).toBe(true);
  });
});

describe("cancelAppointment (backend guards)", () => {
  beforeEach(() => {
    update.mockClear();
    updateResult = { error: null };
  });

  it("action rejects a Cita whose REAL current status is completed — never even sends the UPDATE", async () => {
    currentStatus = "completed";
    expect(await cancelAppointment("appt-completed")).toEqual({ status: "error", message: COMPLETED_CANCEL_ERROR });
    expect(update).not.toHaveBeenCalled();
  });

  it("if it still reaches Postgres (e.g. completed in between), the trigger's rejection is a clear error, never a fake success", async () => {
    currentStatus = "in_progress";
    updateResult = { error: { code: "22023", message: "cannot cancel a completed appointment" } };
    expect(await cancelAppointment("appt-race")).toEqual({ status: "error", message: COMPLETED_CANCEL_ERROR });
  });

  it("a cancellable Cita still cancels", async () => {
    currentStatus = "confirmed";
    expect(await cancelAppointment("appt-confirmed")).toEqual({ status: "ok" });
    expect(update).toHaveBeenCalledWith({ status: "cancelled" });
  });
});

describe("validate_appointment_status_transition (live definition)", () => {
  it("rejects completed → cancelled and keeps the arrival rules", () => {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    const latest = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .reverse()
      .map((f) => readFileSync(path.join(dir, f), "utf8"))
      .find((sql) => /function public\.validate_appointment_status_transition\(\)/.test(sql))!;
    expect(latest).toContain("if new.status = 'cancelled' and old.status = 'completed' then");
    expect(latest).toContain("raise exception 'cannot cancel a completed appointment'");
    expect(latest).toContain("cannot mark patient arrived from status %");
    expect(latest).toContain("cannot send to waiting room from status %");
  });
});
