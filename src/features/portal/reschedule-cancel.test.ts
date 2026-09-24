import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentStatus } from "@/features/dashboard/appointments-data";
import { canPatientChangeAppointment } from "./appointment-eligibility";
import { CANCELLATION_REASONS, isValidCancellationInput } from "./cancellation-reasons";
import { isPortalDaySelectable, isPortalSlotSelectable, portalSlotsForDay, type PortalProfessionalSchedule } from "./schedule-data";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

// Portal "Reprogramar" (a REQUEST — the Cita only moves when the clinic
// accepts) and "Cancelar cita" (real cancellation of her own future
// scheduled/confirmed Cita). Backend: migration 20260924120000.

const NOW = new Date("2026-09-24T18:00:00.000Z");
const FUTURE = "2026-09-29T15:00:00.000Z";
const PAST = "2026-09-24T14:30:00.000Z";

describe("canPatientChangeAppointment (Reprogramar / Cancelar visibility)", () => {
  it.each(["scheduled", "confirmed"] as AppointmentStatus[])("future %s → allowed", (status) => {
    expect(canPatientChangeAppointment({ status, startsAt: FUTURE }, NOW)).toBe(true);
  });

  it.each(["patient_arrived", "waiting_room", "in_progress", "completed", "no_show", "cancelled"] as AppointmentStatus[])(
    "%s → never (clinical flow started or Cita closed)",
    (status) => {
      expect(canPatientChangeAppointment({ status, startsAt: FUTURE }, NOW)).toBe(false);
    },
  );

  it("a scheduled/confirmed Cita that already started → never", () => {
    expect(canPatientChangeAppointment({ status: "confirmed", startsAt: PAST }, NOW)).toBe(false);
  });
});

describe("cancellation reasons", () => {
  it("are exactly the approved modal's options, as stable codes", () => {
    expect(CANCELLATION_REASONS.map((r) => r.label)).toEqual(["No puedo asistir", "Problema personal", "Otro"]);
  });

  it("require a known code, and text for 'Otro'", () => {
    expect(isValidCancellationInput("cannot_attend", "")).toBe(true);
    expect(isValidCancellationInput("other", "   ")).toBe(false);
    expect(isValidCancellationInput("other", "Viaje")).toBe(true);
    expect(isValidCancellationInput("", "")).toBe(false);
    expect(isValidCancellationInput("made_up", "x")).toBe(false);
  });
});

describe("Portal picker slots come from the professional's REAL schedule", () => {
  const schedule: PortalProfessionalSchedule = {
    professionalProfileId: "prof-1",
    availability: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ professionalProfileId: "prof-1", dayOfWeek, startTime: "08:00", endTime: "12:00", active: true })),
    absences: [{ startDate: "2026-09-30", endDate: "2026-09-30" }],
  };

  it("offers only that professional's configured blocks — never the old fixed 08:00–18:00 grid", () => {
    const monday = portalSlotsForDay(schedule, "2026-09-28");
    expect(monday[0]).toBe("8:00 AM");
    expect(monday.at(-1)).toBe("11:30 AM");
    expect(monday).not.toContain("2:00 PM");
    expect(portalSlotsForDay(schedule, "2026-09-27")).toEqual([]); // Sunday: no block
  });

  it("an absence day has no slots and isn't selectable", () => {
    expect(portalSlotsForDay(schedule, "2026-09-30")).toEqual([]);
    expect(isPortalDaySelectable(schedule, "2026-09-30")).toBe(false);
  });

  it("zero configured rows → the same initial Lun–Vie 08:00–17:00 schedule Agenda uses", () => {
    const empty: PortalProfessionalSchedule = { professionalProfileId: "prof-2", availability: [], absences: [] };
    expect(portalSlotsForDay(empty, "2026-09-28").at(-1)).toBe("4:30 PM");
    expect(portalSlotsForDay(empty, "2026-09-27")).toEqual([]);
  });

  it("a slot outside the real schedule is never selectable", () => {
    expect(isPortalSlotSelectable(schedule, "2026-09-28", "3:00 PM")).toBe(false);
  });
});

describe("patient actions never send a patient/clinic id (identity is resolved server-side)", () => {
  beforeEach(() => rpc.mockReset());

  it("requestMyAppointmentReschedule sends only the Cita, professional and preferred time", async () => {
    const { requestMyAppointmentReschedule } = await import("./requests-actions");
    rpc.mockResolvedValue({
      data: { id: "r1", professional_profile_id: "prof-1", preferred_starts_at: FUTURE, status: "pending", accepted_appointment_id: null, created_at: FUTURE },
      error: null,
    });
    const outcome = await requestMyAppointmentReschedule("appt-1", "prof-1", FUTURE);
    expect(rpc).toHaveBeenCalledWith("request_my_appointment_reschedule", { p_appointment_id: "appt-1", p_professional_profile_id: "prof-1", p_preferred_starts_at: FUTURE });
    expect(outcome.status).toBe("ok");
  });

  it.each([
    ["appointment not found or not yours", "No encontramos esta cita en tu cuenta."],
    ["cannot be rescheduled from its current status", "Esta cita ya no se puede reprogramar."],
    ["a pending reschedule request already exists", "Ya tienes una solicitud de reprogramación pendiente para esta cita."],
  ])("reschedule backend '%s' → honest message", async (message, expected) => {
    const { requestMyAppointmentReschedule } = await import("./requests-actions");
    rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await requestMyAppointmentReschedule("appt-x", "prof-1", FUTURE)).toEqual({ status: "error", message: expected });
  });

  it("cancelMyAppointment sends only the Cita and the motivo; completed/other-patient rejections surface clearly", async () => {
    const { cancelMyAppointment } = await import("./appointments-actions");
    rpc.mockResolvedValue({ data: { id: "appt-1", status: "cancelled" }, error: null });
    expect(await cancelMyAppointment("appt-1", "other", "Viaje")).toEqual({ status: "ok", appointmentId: "appt-1" });
    expect(rpc).toHaveBeenCalledWith("cancel_my_appointment", { p_appointment_id: "appt-1", p_reason_code: "other", p_reason_detail: "Viaje" });

    rpc.mockResolvedValue({ data: null, error: { message: "cannot be cancelled from its current status" } });
    expect(await cancelMyAppointment("appt-done", "cannot_attend", null)).toEqual({ status: "error", message: "Esta cita ya no se puede cancelar." });
    rpc.mockResolvedValue({ data: null, error: { message: "appointment not found or not yours" } });
    expect(await cancelMyAppointment("appt-other-patient", "cannot_attend", null)).toEqual({ status: "error", message: "Esta cita no existe o no te pertenece." });
  });
});

// No local Postgres in this environment (same caveat as every SQL test in
// this repo) — these pin the migration's security/atomicity predicates.
describe("migration 20260924120000 — security and atomicity predicates", () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20260924120000_portal_reschedule_and_cancel.sql"), "utf8");
  const fn = (name: string) => {
    const start = sql.search(new RegExp(`function public\\.${name}\\(`));
    return sql.slice(start, sql.indexOf("$$;", sql.indexOf("$$", start) + 2));
  };

  it("patient RPCs take no patient/clinic id and resolve identity from auth.uid()", () => {
    for (const name of ["request_my_appointment_reschedule", "cancel_my_appointment", "get_my_professional_schedule"]) {
      const body = fn(name);
      expect(body).toContain("public.my_linked_patient_id()");
      expect(body.slice(0, body.indexOf(")"))).not.toMatch(/p_patient_id|p_clinic_id/);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
    }
  });

  it("reschedule/cancel only touch HER OWN future scheduled/confirmed Cita", () => {
    for (const name of ["request_my_appointment_reschedule", "cancel_my_appointment"]) {
      const body = fn(name);
      expect(body).toContain("and a.patient_id = v_patient_id");
      expect(body).toContain("for update");
      expect(body).toContain("not in ('scheduled', 'confirmed')");
      expect(body).toContain("starts_at <= now()");
    }
  });

  it("requesting a reschedule never modifies the Cita", () => {
    expect(fn("request_my_appointment_reschedule")).not.toMatch(/update public\.appointments/);
  });

  it("accepting a reschedule UPDATEs the same linked Cita (never inserts a second one); a new request still inserts", () => {
    const body = fn("accept_appointment_request");
    const branch = body.slice(body.indexOf("if v_request.kind = 'reschedule' then"), body.indexOf("  else\n"));
    expect(branch).toContain("update public.appointments");
    expect(branch).toContain("where id = v_appointment.id");
    expect(branch).not.toContain("insert into public.appointments");
    expect(branch).toContain("and a.patient_id = v_request.patient_id");
    expect(branch).toContain("can_access_appointment(v_appointment.clinic_id, v_appointment.professional_profile_id)");
    expect(body).toContain("accepted_appointment_id = v_appointment.id");
  });

  it("at most one pending reschedule per Cita and one pending new request per patient", () => {
    expect(sql).toContain("on public.appointment_requests (appointment_id)\n  where status = 'pending' and kind = 'reschedule'");
    expect(sql).toContain("on public.appointment_requests (patient_id)\n  where status = 'pending' and kind = 'new'");
    expect(fn("request_my_appointment")).toContain("and r.kind = 'new'");
  });

  it("the completed → cancelled DB guard is preserved; cancelling records motivo + patient origin, never deletes", () => {
    expect(fn("validate_appointment_status_transition")).toContain("raise exception 'cannot cancel a completed appointment'");
    const cancel = fn("cancel_my_appointment");
    expect(cancel).toContain("cancelled_by = 'patient'");
    expect(cancel).toContain("cancellation_reason_code = p_reason_code");
    expect(cancel).not.toMatch(/delete from/i);
  });
});
