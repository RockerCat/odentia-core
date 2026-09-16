import { describe, expect, it } from "vitest";
import { decideMarketplaceEntryRedirect } from "./decide-marketplace-entry-redirect";
import type { ClinicContext } from "@/features/session/types";

// Regression coverage for Patient Marketplace Identity: /marketplace/entrar
// used to redirect ANY "no-membership" visitor away (to /portal or
// /registro) before ever attempting issue_marketplace_sso_code() — a real,
// linked Patient with zero clinic_memberships rows was blocked from
// Marketplace SSO entirely, even though Marketplace never needs a clinic
// for a Patient buyer at all.

const OK: ClinicContext = {
  status: "ok",
  profile: { id: "p1", firstName: "Ana", lastName: "Admin", email: "ana@example.com", avatarUrl: null },
  membership: { id: "m1", clinicId: "c1", role: "clinic_admin", status: "active" },
  clinic: { id: "c1", name: "Clínica", slug: "clinica", logoUrl: null, status: "active" },
  professionalProfile: null,
};

describe("decideMarketplaceEntryRedirect", () => {
  it("a real clinic member proceeds (no redirect), regardless of the patient flag", () => {
    expect(decideMarketplaceEntryRedirect(OK, false)).toBeNull();
    expect(decideMarketplaceEntryRedirect(OK, true)).toBeNull();
  });

  it("REGRESSION: a no-membership visitor who IS a Marketplace-eligible patient proceeds, never redirected to /portal", () => {
    expect(decideMarketplaceEntryRedirect({ status: "no-membership" }, true)).toBeNull();
  });

  it("a genuinely unlinked, non-staff, non-patient account still goes to /registro", () => {
    expect(decideMarketplaceEntryRedirect({ status: "no-membership" }, false)).toBe("/registro");
  });

  it("unauthenticated always goes to /login, regardless of the patient flag", () => {
    expect(decideMarketplaceEntryRedirect({ status: "unauthenticated" }, false)).toBe("/login");
    expect(decideMarketplaceEntryRedirect({ status: "unauthenticated" }, true)).toBe("/login");
  });

  it("membership-inactive/clinic-suspended/multiple-memberships still fail closed to /acceso-restringido, never bypassed by the patient flag", () => {
    expect(decideMarketplaceEntryRedirect({ status: "membership-inactive" }, true)).toBe(
      "/acceso-restringido?motivo=inactiva",
    );
    expect(decideMarketplaceEntryRedirect({ status: "clinic-suspended" }, true)).toBe(
      "/acceso-restringido?motivo=suspendida",
    );
    expect(decideMarketplaceEntryRedirect({ status: "multiple-memberships" }, true)).toBe(
      "/acceso-restringido?motivo=multiple",
    );
  });
});
