import { describe, expect, it } from "vitest";
import { looksLikeClinicId } from "./clinics-data";

// Regression coverage for "PROMPT NINJA — URLs canónicas por slug para
// detalle de clínicas en Platform": the one pure, directly testable piece
// of the slug/UUID-compatibility logic in .../clinicas/[slug]/page.tsx.
// This predicate is what stops an arbitrary slug lookup miss from ever
// reaching clinics.id (a real `uuid` column) and throwing Postgres'
// "invalid input syntax for type uuid" instead of a clean not-found — see
// scenario E/F in that task's own test list.
describe("looksLikeClinicId", () => {
  it("recognizes a real clinic UUID, exactly as returned by provision_clinic()", () => {
    expect(looksLikeClinicId("938540c9-3e6b-461e-a93c-fdd8c2b905e7")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(looksLikeClinicId("938540C9-3E6B-461E-A93C-FDD8C2B905E7")).toBe(true);
  });

  it("rejects a real slug — never mistaken for a UUID (E: no unsafe fallback for a missing slug)", () => {
    expect(looksLikeClinicId("odentia-qa-provisioning")).toBe(false);
  });

  it("rejects a slug that merely contains hyphens and hex-looking characters", () => {
    expect(looksLikeClinicId("cafe-dental-2")).toBe(false);
  });

  it("rejects an empty string and a non-UUID-shaped id-like string (F: safe for a nonexistent/malformed id)", () => {
    expect(looksLikeClinicId("")).toBe(false);
    expect(looksLikeClinicId("938540c9-3e6b-461e-a93c")).toBe(false);
  });
});
