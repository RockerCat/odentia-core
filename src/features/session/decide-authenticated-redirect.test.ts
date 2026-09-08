import { describe, expect, it } from "vitest";
import { decideAuthenticatedRedirect } from "./decide-authenticated-redirect";
import type { ClinicContext, PatientContext } from "./types";

// Regression coverage for "PROMPT NINJA — Patient Portal real: acceso +
// identidad del paciente" — the shared /login-already-authenticated
// decision src/lib/supabase/proxy.ts and src/app/login/page.tsx both call,
// so the two can never drift apart (see that file's own comment).

const UNAUTH_PATIENT: PatientContext = { status: "unauthenticated" };

const OK_CLINIC = { status: "ok" } as ClinicContext;
const OK_PATIENT = { status: "ok" } as PatientContext;

describe("decideAuthenticatedRedirect", () => {
  it("sends real staff (clinic context ok) to /agenda, regardless of patient status", () => {
    expect(decideAuthenticatedRedirect(OK_CLINIC, UNAUTH_PATIENT)).toBe("/agenda");
    // Even if the same real person also happens to be a linked patient
    // somewhere — clinic status always wins first (see the file's own
    // comment on why).
    expect(decideAuthenticatedRedirect(OK_CLINIC, OK_PATIENT)).toBe("/agenda");
  });

  it("sends a real linked patient (no staff membership) to /portal/citas", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    expect(decideAuthenticatedRedirect(clinic, OK_PATIENT)).toBe("/portal/citas");
  });

  it("escalates a restricted STAFF status to the restricted screen with the right reason", () => {
    const clinic: ClinicContext = { status: "membership-inactive" };
    expect(decideAuthenticatedRedirect(clinic, UNAUTH_PATIENT)).toBe("/acceso-restringido?motivo=inactiva");
  });

  it("escalates an ambiguous patient status (multiple links) to its own restricted reason", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    const patient: PatientContext = { status: "multiple-links" };
    expect(decideAuthenticatedRedirect(clinic, patient)).toBe("/acceso-restringido?motivo=paciente-multiple");
  });

  it("escalates a suspended-clinic patient status too", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    const patient: PatientContext = { status: "clinic-suspended" };
    expect(decideAuthenticatedRedirect(clinic, patient)).toBe("/acceso-restringido?motivo=suspendida");
  });

  it("falls through to /registro for a genuinely fresh account (neither staff nor patient)", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    const patient: PatientContext = { status: "not-linked" };
    expect(decideAuthenticatedRedirect(clinic, patient)).toBe("/registro");
  });
});
