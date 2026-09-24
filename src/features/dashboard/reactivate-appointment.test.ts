import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { canPatientChangeAppointment } from "@/features/portal/appointment-eligibility";
import { applyStatusLocally } from "./cancellation-info";
import { canCancelAppointment } from "./real-status";

// Pilot E2E: a patient-cancelled future Cita, reactivated by staff, ended
// up "Paciente llegó" — the modal's primary button turned into "Paciente
// llegó" right after "Reactivar cita" succeeded and a second click marked
// the arrival. Reactivation must leave it Confirmada and manageable.

const { update } = vi.hoisted(() => ({ update: vi.fn(() => ({ eq: async () => ({ error: { code: "22023", message: "cancelled appointment can only be reactivated as scheduled or confirmed (not in_progress)" } }) })) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { clinic_id: "c1", professional_profile_id: "p1", starts_at: "2026-10-05T15:00:00Z", duration_minutes: 30, status: "in_progress" },
            error: null,
          }),
        }),
      }),
      update,
    }),
  }),
}));

const SRC = path.resolve(__dirname);
const read = (f: string) => fs.readFileSync(path.join(SRC, f), "utf8");

describe("Reactivar cita", () => {
  it("writes exactly `confirmed` — never an arrival/clinical status", () => {
    expect(read("appointments-actions.ts")).toContain('return updateAppointment(appointmentId, { status: "confirmed" });');
  });

  it("closes the modal on success so the same button can't then mark 'Paciente llegó'", () => {
    const modal = read("real-appointment-detail-modal.tsx");
    const handler = modal.slice(modal.indexOf("const result = await reactivateAppointment(appointment.id);"), modal.indexOf("if (showMarkArrived) {"));
    expect(handler).toContain('onUpdated(applyStatusLocally(appointment, "confirmed"));');
    expect(handler).toContain("onClose();");
    expect(handler).not.toContain("markPatientArrived");
  });

  it("the reactivated Cita is Confirmada with its cancellation data cleared", () => {
    expect(
      applyStatusLocally({ status: "cancelled", cancelledBy: "patient", cancellationReasonCode: "other", cancellationReasonDetail: "Viaje" }, "confirmed"),
    ).toEqual({ status: "confirmed", cancelledBy: null, cancellationReasonCode: null, cancellationReasonDetail: null });
  });

  it("a reactivated FUTURE Confirmada Cita is again eligible for Portal Reprogramar/Cancelar; completed still never cancellable", () => {
    const now = new Date("2026-09-24T21:00:00.000Z");
    expect(canPatientChangeAppointment({ status: "confirmed", startsAt: "2026-09-29T15:00:00.000Z" }, now)).toBe(true);
    expect(canPatientChangeAppointment({ status: "patient_arrived", startsAt: "2026-09-29T15:00:00.000Z" }, now)).toBe(false);
    expect(canCancelAppointment("completed", "clinic_admin")).toBe(false);
  });

  it("the DB rejection of cancelled → a clinical status surfaces as a clear message", async () => {
    const { updateAppointment } = await import("./appointments-actions");
    // (row already moved on in this fixture; the point is the error mapping)
    expect(await updateAppointment("appt-1", { status: "completed" })).toEqual({
      status: "error",
      message: "Una cita cancelada solo puede reactivarse como Confirmada o Pendiente.",
    });
  });
});

// No local Postgres here (same caveat as every SQL test in this repo).
describe("validate_appointment_status_transition (latest definition)", () => {
  const dir = path.resolve(__dirname, "../../../supabase/migrations");
  const latest = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .find((sql) => /function public\.validate_appointment_status_transition\(\)/.test(sql))!;

  it("from cancelled only scheduled/confirmed are allowed", () => {
    expect(latest).toContain("if old.status = 'cancelled' and new.status not in ('scheduled', 'confirmed') then");
  });

  it("keeps every existing rule: completed → cancelled guard, arrival transitions, motivo clearing", () => {
    expect(latest).toContain("raise exception 'cannot cancel a completed appointment'");
    expect(latest).toContain("if old.status not in ('scheduled', 'confirmed') then\n        raise exception 'cannot mark patient arrived from status %'");
    expect(latest).toContain("if old.status is distinct from 'patient_arrived' then");
    expect(latest).toContain("new.cancellation_reason_code := null;");
  });
});
