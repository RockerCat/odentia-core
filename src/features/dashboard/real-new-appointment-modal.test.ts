import { describe, expect, it } from "vitest";
import { resolveProfessionalPickerState } from "./real-new-appointment-modal";

// "Agenda → Nueva cita → Profesional" empty-state — closes the pilot gap
// where a clinic with 0 active clinical professionals (the flagship
// Primary Use Case: a solo Clinic-Admin-Dentist who hasn't self-configured
// yet) hit a bare, unexplained "Sin resultados" with no way forward. See
// CLAUDE.md's Domain Model — Primary Use Case.
describe("resolveProfessionalPickerState", () => {
  it("0 professionals + clinic_admin → empty state WITH the /clinica CTA", () => {
    expect(resolveProfessionalPickerState(0, "clinic_admin")).toBe("empty-can-configure");
  });

  it("0 professionals + assistant → empty state WITHOUT a CTA (can't configure one)", () => {
    expect(resolveProfessionalPickerState(0, "assistant")).toBe("empty-cannot-configure");
  });

  it("0 professionals + dentist → empty state WITHOUT a CTA (create_my_professional_profile is clinic_admin-only)", () => {
    expect(resolveProfessionalPickerState(0, "dentist")).toBe("empty-cannot-configure");
  });

  it("a real, non-empty roster → normal picker, regardless of role — a search-with-no-match stays the Combobox's own generic empty text", () => {
    expect(resolveProfessionalPickerState(1, "clinic_admin")).toBe("picker");
    expect(resolveProfessionalPickerState(3, "assistant")).toBe("picker");
    expect(resolveProfessionalPickerState(1, "dentist")).toBe("picker");
  });
});
