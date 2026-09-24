import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { slotStartIso } from "@/features/dashboard/real-format";
import { isCurrentAppointmentSlot } from "./schedule-data";

// Pilot E2E: "Reprogramar" offered the Cita's own current slot (24 sep,
// 5:00 PM, Admin Borcelle 2) — a reschedule that changes nothing.

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const CURRENT = { professionalProfileId: "prof-admin", startsAt: slotStartIso("2026-09-28", "5:00 PM") };

describe("isCurrentAppointmentSlot (Reprogramar picker)", () => {
  it("same professional + same date + same time → the current slot (not selectable)", () => {
    expect(isCurrentAppointmentSlot(CURRENT, "prof-admin", "2026-09-28", "5:00 PM")).toBe(true);
  });

  it("another time the same day, or another day, with the same professional → selectable", () => {
    expect(isCurrentAppointmentSlot(CURRENT, "prof-admin", "2026-09-28", "4:30 PM")).toBe(false);
    expect(isCurrentAppointmentSlot(CURRENT, "prof-admin", "2026-09-29", "5:00 PM")).toBe(false);
  });

  it("same date/time with ANOTHER professional is a real change → selectable", () => {
    expect(isCurrentAppointmentSlot(CURRENT, "prof-other", "2026-09-28", "5:00 PM")).toBe(false);
  });

  it("'Agendar nueva cita' passes no current slot → nothing is ever excluded", () => {
    expect(isCurrentAppointmentSlot(undefined, "prof-admin", "2026-09-28", "5:00 PM")).toBe(false);
  });

  it("the modal passes the Cita's own professional + startsAt; the new-request scheduler does not", () => {
    const screen = fs.readFileSync(path.resolve(__dirname, "my-appointments-screen.tsx"), "utf8");
    expect(screen).toContain("currentSlot={{ professionalProfileId: appointment.professionalProfileId, startsAt: appointment.startsAt }}");
    expect(screen).toContain("<RequestAppointmentScheduler professionals={professionals} onSubmit={submitNewRequest} />");
  });
});

describe("backend guard", () => {
  it("the server's rejection surfaces as the clear message", async () => {
    const { requestMyAppointmentReschedule } = await import("./requests-actions");
    rpc.mockResolvedValue({ data: null, error: { message: "preferred slot is the same as the current appointment" } });
    expect(await requestMyAppointmentReschedule("appt-1", "prof-admin", CURRENT.startsAt)).toEqual({
      status: "error",
      message: "Selecciona un horario diferente al de tu cita actual.",
    });
  });

  // No local Postgres here (same caveat as every SQL test in this repo).
  it("the LATEST request_my_appointment_reschedule() rejects same professional + same minute, against the real row", () => {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    const latest = readdirSorted(dir)
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .find((sql) => /function public\.request_my_appointment_reschedule\(/.test(sql))!;
    expect(latest).toContain("if p_professional_profile_id = v_appointment.professional_profile_id");
    expect(latest).toContain("and date_trunc('minute', p_preferred_starts_at) = date_trunc('minute', v_appointment.starts_at) then");
    expect(latest).toContain("raise exception 'preferred slot is the same as the current appointment'");
    // Other rules unchanged: ownership, eligible statuses, future-only, one pending per Cita.
    expect(latest).toContain("and a.patient_id = v_patient_id");
    expect(latest).toContain("not in ('scheduled', 'confirmed')");
    expect(latest).toContain("raise exception 'a pending reschedule request already exists'");
  });
});

function readdirSorted(dir: string): string[] {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().reverse();
}
