import { describe, expect, it } from "vitest";
import { canEditClinicalData } from "./clinical-permissions";
import type { ClinicContext, MembershipRole } from "@/features/session/types";

// Regression coverage for historical bug: a Clinic Admin with no active
// professional_profile could reach /agenda/atencion/[appointmentId] and
// fill in a whole encounter form only to hit a permission error at
// "Finalizar atención" (the RPC's own is_active_clinical_professional
// check). canEditClinicalData mirrors that RPC exactly so the UI gate
// (RealAppointmentDetailModal's canAttendPatients, the real route's own
// server-side check) agrees with it before ever letting the user in.

function okCtx(role: MembershipRole, profileActive: boolean | null): ClinicContext {
  return {
    status: "ok",
    profile: { id: "profile-1", firstName: "Test", lastName: "User", email: "t@example.com", avatarUrl: null },
    clinic: { id: "clinic-1", name: "Test", slug: "test", logoUrl: null, status: "active" },
    membership: { id: "membership-1", clinicId: "clinic-1", role, status: "active" },
    professionalProfile: profileActive === null ? null : { id: "prof-1", active: profileActive },
  };
}

describe("canEditClinicalData", () => {
  it("Clinic Admin WITHOUT an active professional_profile cannot edit clinical data (the historical bug's exact scenario)", () => {
    expect(canEditClinicalData(okCtx("clinic_admin", null))).toBe(false);
    expect(canEditClinicalData(okCtx("clinic_admin", false))).toBe(false);
  });

  it("Clinic Admin WITH an active professional_profile can edit clinical data", () => {
    expect(canEditClinicalData(okCtx("clinic_admin", true))).toBe(true);
  });

  it("Dentist follows the exact same rule as Clinic Admin — active profile required", () => {
    expect(canEditClinicalData(okCtx("dentist", true))).toBe(true);
    expect(canEditClinicalData(okCtx("dentist", null))).toBe(false);
    expect(canEditClinicalData(okCtx("dentist", false))).toBe(false);
  });

  it("Assistant can never edit clinical data, even with an active professional_profile somehow set", () => {
    expect(canEditClinicalData(okCtx("assistant", true))).toBe(false);
    expect(canEditClinicalData(okCtx("assistant", null))).toBe(false);
  });

  it("an unresolved clinic context (no membership, inactive, suspended clinic, etc.) can never edit clinical data", () => {
    expect(canEditClinicalData({ status: "no-membership" })).toBe(false);
    expect(canEditClinicalData({ status: "membership-inactive" })).toBe(false);
    expect(canEditClinicalData({ status: "clinic-suspended" })).toBe(false);
    expect(canEditClinicalData({ status: "multiple-memberships" })).toBe(false);
    expect(canEditClinicalData({ status: "unauthenticated" })).toBe(false);
  });
});
