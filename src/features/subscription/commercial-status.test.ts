import { describe, expect, it } from "vitest";
import { deriveClinicCommercialLabel } from "./commercial-status";

const NOW = new Date("2026-09-22T00:00:00Z");

describe("deriveClinicCommercialLabel", () => {
  it("suspended wins regardless of trial_ends_at", () => {
    expect(deriveClinicCommercialLabel({ status: "suspended", trialEndsAt: null }, NOW)).toBe("suspended");
    expect(
      deriveClinicCommercialLabel({ status: "suspended", trialEndsAt: "2027-01-01T00:00:00Z" }, NOW),
    ).toBe("suspended");
  });

  it("active with no trial tracked → active (paying/untracked, never invented as trialing)", () => {
    expect(deriveClinicCommercialLabel({ status: "active", trialEndsAt: null }, NOW)).toBe("active");
  });

  it("active with a future trial_ends_at → trial", () => {
    expect(deriveClinicCommercialLabel({ status: "active", trialEndsAt: "2026-10-01T00:00:00Z" }, NOW)).toBe("trial");
  });

  it("active with a past trial_ends_at → trial_expired (never auto-suspended)", () => {
    expect(deriveClinicCommercialLabel({ status: "active", trialEndsAt: "2026-09-01T00:00:00Z" }, NOW)).toBe(
      "trial_expired",
    );
  });

  it("trial_ends_at exactly now is treated as already ended (strict >, not >=)", () => {
    expect(deriveClinicCommercialLabel({ status: "active", trialEndsAt: NOW.toISOString() }, NOW)).toBe(
      "trial_expired",
    );
  });
});
