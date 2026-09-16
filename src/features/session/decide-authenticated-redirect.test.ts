import { describe, expect, it } from "vitest";
import { decideAuthenticatedRedirect } from "./decide-authenticated-redirect";
import type { ClinicContext, PatientContext, SuperadminContext } from "./types";

// Regression coverage for "PROMPT NINJA — Patient Portal real: acceso +
// identidad del paciente" plus "PROMPT MASTER — Checkpoint 2: identidad
// real SUPERADMIN + acceso protegido a /platform" — the shared
// /login-already-authenticated decision src/lib/supabase/proxy.ts and
// src/app/login/page.tsx both call, so the two can never drift apart (see
// that file's own comment).

const UNAUTH_SUPERADMIN: SuperadminContext = { status: "unauthenticated" };
const NOT_SUPERADMIN: SuperadminContext = { status: "not-superadmin" };
const OK_SUPERADMIN = { status: "ok" } as SuperadminContext;

const UNAUTH_PATIENT: PatientContext = { status: "unauthenticated" };

const OK_CLINIC = { status: "ok" } as ClinicContext;
const OK_PATIENT = { status: "ok" } as PatientContext;

describe("decideAuthenticatedRedirect", () => {
  // Checkpoint 2 scenario A — SUPERADMIN only
  it("sends a real Superadmin (no clinic, no patient) to /platform", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    expect(decideAuthenticatedRedirect(OK_SUPERADMIN, clinic, UNAUTH_PATIENT)).toBe("/platform");
  });

  // Checkpoint 2 scenario B — SUPERADMIN + clinic membership
  it("sends a real Superadmin who ALSO has an active clinic membership to /platform — Superadmin wins first", () => {
    expect(decideAuthenticatedRedirect(OK_SUPERADMIN, OK_CLINIC, UNAUTH_PATIENT)).toBe("/platform");
  });

  // Checkpoint 2 scenario C — SUPERADMIN + patient access
  it("sends a real Superadmin who ALSO has Patient access to /platform — Superadmin wins first", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    expect(decideAuthenticatedRedirect(OK_SUPERADMIN, clinic, OK_PATIENT)).toBe("/platform");
  });

  // Checkpoint 2 scenario D — clinic member, not superadmin
  it("sends real staff (clinic context ok) to /agenda when not a Superadmin, regardless of patient status", () => {
    expect(decideAuthenticatedRedirect(NOT_SUPERADMIN, OK_CLINIC, UNAUTH_PATIENT)).toBe("/agenda");
    // Even if the same real person also happens to be a linked patient
    // somewhere — clinic status still wins over patient (see the file's
    // own comment on why), just after Superadmin.
    expect(decideAuthenticatedRedirect(NOT_SUPERADMIN, OK_CLINIC, OK_PATIENT)).toBe("/agenda");
  });

  // Checkpoint 2 scenario E — patient, not superadmin
  it("sends a real linked patient (no staff membership, not a Superadmin) to /portal/citas", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    expect(decideAuthenticatedRedirect(NOT_SUPERADMIN, clinic, OK_PATIENT)).toBe("/portal/citas");
  });

  it("escalates a restricted STAFF status to the restricted screen with the right reason", () => {
    const clinic: ClinicContext = { status: "membership-inactive" };
    expect(decideAuthenticatedRedirect(NOT_SUPERADMIN, clinic, UNAUTH_PATIENT)).toBe("/acceso-restringido?motivo=inactiva");
  });

  it("escalates an ambiguous patient status (multiple links) to its own restricted reason", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    const patient: PatientContext = { status: "multiple-links" };
    expect(decideAuthenticatedRedirect(NOT_SUPERADMIN, clinic, patient)).toBe("/acceso-restringido?motivo=paciente-multiple");
  });

  it("escalates a suspended-clinic patient status too", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    const patient: PatientContext = { status: "clinic-suspended" };
    expect(decideAuthenticatedRedirect(NOT_SUPERADMIN, clinic, patient)).toBe("/acceso-restringido?motivo=suspendida");
  });

  // Checkpoint 2 scenario F — authenticated with none (fallback, unchanged)
  it("falls through to /registro for a genuinely fresh account (neither superadmin, staff, nor patient)", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    const patient: PatientContext = { status: "not-linked" };
    expect(decideAuthenticatedRedirect(NOT_SUPERADMIN, clinic, patient)).toBe("/registro");
  });

  it("an unauthenticated superadmin context never wins on its own — falls through exactly like not-superadmin", () => {
    const clinic: ClinicContext = { status: "no-membership" };
    const patient: PatientContext = { status: "not-linked" };
    expect(decideAuthenticatedRedirect(UNAUTH_SUPERADMIN, clinic, patient)).toBe("/registro");
  });
});
