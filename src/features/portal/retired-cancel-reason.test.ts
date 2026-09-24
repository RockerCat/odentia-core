import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCancellationInfo } from "@/features/dashboard/cancellation-info";
import { CANCELLATION_REASON_LABELS, CANCELLATION_REASONS, isValidCancellationInput } from "./cancellation-reasons";

// "Necesito reprogramar" (need_reschedule) retired as a motivo for NEW
// cancellations — the Portal's Reprogramar flow covers it — while any
// stored Cita that already has it keeps displaying correctly.

describe("retired cancellation reason: need_reschedule", () => {
  it("the Cancelar cita select offers exactly the 3 approved motivos", () => {
    expect(CANCELLATION_REASONS.map((r) => r.label)).toEqual(["No puedo asistir", "Problema personal", "Otro"]);
    const screen = fs.readFileSync(path.resolve(__dirname, "my-appointments-screen.tsx"), "utf8");
    expect(screen).toContain("{CANCELLATION_REASONS.map((reason) => (");
  });

  it("a new cancellation can't use it (client validation)", () => {
    expect(isValidCancellationInput("need_reschedule", "")).toBe(false);
    expect(isValidCancellationInput("cannot_attend", "")).toBe(true);
  });

  it("'Otro' still requires detail", () => {
    expect(isValidCancellationInput("other", "  ")).toBe(false);
    expect(isValidCancellationInput("other", "Viaje")).toBe(true);
  });

  it("a historical Cita with the retired code still shows 'Necesito reprogramar'", () => {
    expect(CANCELLATION_REASON_LABELS.need_reschedule).toBe("Necesito reprogramar");
    expect(
      getCancellationInfo({ status: "cancelled", cancelledBy: "patient", cancellationReasonCode: "need_reschedule", cancellationReasonDetail: null }),
    ).toEqual({ cancelledByLabel: "Paciente", reasonLabel: "Necesito reprogramar", detail: null });
  });

  // No local Postgres here (same caveat as every SQL test in this repo).
  it("backend: the LATEST cancel_my_appointment() rejects it even bypassing the UI; stored rows stay valid", () => {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().reverse();
    const latest = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).find((sql) => /function public\.cancel_my_appointment\(/.test(sql))!;
    expect(latest).toContain("if p_reason_code is null or p_reason_code not in ('cannot_attend', 'personal', 'other') then");
    expect(latest).toContain("if p_reason_code = 'other' and v_detail is null then");
    // The table constraint (history) is untouched and still admits it.
    const constraintFile = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).find((sql) => sql.includes("appointments_cancellation_reason_code_check\n    check"))!;
    expect(constraintFile).toContain("cancellation_reason_code in ('cannot_attend', 'need_reschedule', 'personal', 'other')");
    expect(files.join("\n")).not.toMatch(/drop constraint appointments_cancellation_reason_code_check/);
  });
});
