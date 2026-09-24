import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AppointmentStatus } from "./appointments-data";
import { applyStatusLocally, getCancellationInfo } from "./cancellation-info";
import { canCancelAppointment } from "./real-status";

// Staff opening a CANCELLED Cita: never "Cancelar cita" again, "Reactivar
// cita" kept, and who cancelled it + the real motivo shown.

const ROLES = ["clinic_admin", "dentist", "assistant"] as const;
const cancelled = (overrides = {}) => ({
  status: "cancelled" as AppointmentStatus,
  cancelledBy: null as string | null,
  cancellationReasonCode: null as string | null,
  cancellationReasonDetail: null as string | null,
  ...overrides,
});

describe("actions on a cancelled Cita", () => {
  it.each(ROLES)("never offers 'Cancelar cita' — %s", (role) => {
    expect(canCancelAppointment("cancelled", role)).toBe(false);
  });

  it("other statuses keep their current rule", () => {
    for (const role of ROLES) {
      for (const status of ["scheduled", "confirmed", "patient_arrived", "waiting_room"] as AppointmentStatus[]) {
        expect(canCancelAppointment(status, role)).toBe(true);
      }
      expect(canCancelAppointment("completed", role)).toBe(false);
    }
    expect(canCancelAppointment("in_progress", "assistant")).toBe(false);
    expect(canCancelAppointment("in_progress", "clinic_admin")).toBe(true);
  });

  it("'Reactivar cita' keeps its existing rule (shown for any cancelled Cita)", () => {
    const modal = fs.readFileSync(path.resolve(__dirname, "real-appointment-detail-modal.tsx"), "utf8");
    expect(modal).toContain("const showReactivate = isCancelled;");
    expect(modal).toContain("const showCancelCta = canCancelAppointment(appointment.status, role);");
  });
});

describe("getCancellationInfo", () => {
  it("patient cancellation → 'Paciente' + the real motivo label from the Portal catalog", () => {
    expect(getCancellationInfo(cancelled({ cancelledBy: "patient", cancellationReasonCode: "cannot_attend" }))).toEqual({
      cancelledByLabel: "Paciente",
      reasonLabel: "No puedo asistir",
      detail: null,
    });
  });

  it("'Otro' shows the patient's own detail when present", () => {
    expect(getCancellationInfo(cancelled({ cancelledBy: "patient", cancellationReasonCode: "other", cancellationReasonDetail: "  Viaje de trabajo " }))).toEqual({
      cancelledByLabel: "Paciente",
      reasonLabel: "Otro",
      detail: "Viaje de trabajo",
    });
  });

  it("no detail → nothing invented; detail on a non-'Otro' code is never shown", () => {
    expect(getCancellationInfo(cancelled({ cancelledBy: "patient", cancellationReasonCode: "other", cancellationReasonDetail: "  " }))?.detail).toBeNull();
    expect(getCancellationInfo(cancelled({ cancelledBy: "patient", cancellationReasonCode: "personal", cancellationReasonDetail: "x" }))?.detail).toBeNull();
  });

  it("clinic cancellation (no cancelled_by, no motivo recorded) → 'Clínica' and no motivo row", () => {
    expect(getCancellationInfo(cancelled())).toEqual({ cancelledByLabel: "Clínica", reasonLabel: null, detail: null });
    expect(getCancellationInfo({ status: "cancelled" })).toEqual({ cancelledByLabel: "Clínica", reasonLabel: null, detail: null });
  });

  it("not cancelled → nothing to show", () => {
    for (const status of ["scheduled", "confirmed", "completed", "no_show"] as AppointmentStatus[]) {
      expect(getCancellationInfo(cancelled({ status, cancelledBy: "patient", cancellationReasonCode: "personal" }))).toBeNull();
    }
  });
});

describe("applyStatusLocally", () => {
  it("reactivating clears the cancellation data (mirrors the DB trigger)", () => {
    const next = applyStatusLocally(cancelled({ cancelledBy: "patient", cancellationReasonCode: "other", cancellationReasonDetail: "Viaje" }), "confirmed");
    expect(next).toEqual({ status: "confirmed", cancelledBy: null, cancellationReasonCode: null, cancellationReasonDetail: null });
  });

  it("any other status change leaves the object as-is apart from status", () => {
    expect(applyStatusLocally(cancelled({ status: "scheduled" }), "confirmed").status).toBe("confirmed");
  });
});
