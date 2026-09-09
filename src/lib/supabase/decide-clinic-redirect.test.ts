import { describe, expect, it } from "vitest";
import { decideClinicRedirect } from "./proxy";
import type { ClinicContext } from "@/features/session/types";

// Regression coverage for F001: a real, authenticated Patient hitting a
// staff-only route (direct URL, hard refresh, bookmark) landed on
// /registro's own onboarding wizard instead of /portal — not a security
// hole (she never sees clinic data), just the wrong destination, because
// "no-membership" used to mean only one thing (a genuinely new account
// needing onboarding). isLinkedPatient disambiguates the two without
// touching any other status branch.

const OK: ClinicContext = {
  status: "ok",
  profile: { id: "p1", firstName: "Ana", lastName: "Admin", email: "ana@example.com", avatarUrl: null },
  membership: { id: "m1", clinicId: "c1", role: "clinic_admin", status: "active" },
  clinic: { id: "c1", name: "Clínica", slug: "clinica", logoUrl: null, status: "active" },
  professionalProfile: null,
};

describe("decideClinicRedirect", () => {
  it("REGRESSION (F001): a linked Patient with no clinic membership goes to /portal, not /registro", () => {
    expect(decideClinicRedirect({ status: "no-membership" }, true)).toBe("/portal");
  });

  it("a genuinely unlinked, non-staff account still goes to /registro (existing onboarding behavior preserved)", () => {
    expect(decideClinicRedirect({ status: "no-membership" }, false)).toBe("/registro");
  });

  it("unauthenticated always goes to /login, regardless of isLinkedPatient", () => {
    expect(decideClinicRedirect({ status: "unauthenticated" }, false)).toBe("/login");
    expect(decideClinicRedirect({ status: "unauthenticated" }, true)).toBe("/login");
  });

  it("an active staff membership never redirects, regardless of isLinkedPatient", () => {
    expect(decideClinicRedirect(OK, false)).toBeNull();
    expect(decideClinicRedirect(OK, true)).toBeNull();
  });

  it("inactive-membership restriction is unchanged by isLinkedPatient — still the honest restricted screen, never /portal", () => {
    expect(decideClinicRedirect({ status: "membership-inactive" }, false)).toBe("/acceso-restringido?motivo=inactiva");
    expect(decideClinicRedirect({ status: "membership-inactive" }, true)).toBe("/acceso-restringido?motivo=inactiva");
  });

  it("clinic-suspended and multiple-memberships are likewise unaffected by isLinkedPatient", () => {
    expect(decideClinicRedirect({ status: "clinic-suspended" }, true)).toBe("/acceso-restringido?motivo=suspendida");
    expect(decideClinicRedirect({ status: "multiple-memberships" }, true)).toBe("/acceso-restringido?motivo=multiple");
  });
});
