import { describe, expect, it, vi } from "vitest";
import { bridgeAuthenticatedContext } from "./role-bridge";
import type { ClinicContext, PatientContext } from "./types";

// Regression coverage for a real production bug: use-route-guard.ts's
// self-heal (see that file's own comment) and /login's own form submit
// both need the exact same "which context wins" selection — this proves
// it once, shared, rather than trusting the two call sites to agree.
// writeSession itself is a no-op outside a browser (see
// src/features/auth/session.ts's own `typeof window === "undefined"`
// guard) and this project's vitest config has no DOM environment (pure
// logic only) — mocked here so the DECISION is provable without one.

const { writeSession } = vi.hoisted(() => ({ writeSession: vi.fn() }));
vi.mock("@/features/auth/session", () => ({ writeSession, clearSession: vi.fn() }));

const UNAUTHENTICATED_CLINIC: ClinicContext = { status: "unauthenticated" };
const UNAUTHENTICATED_PATIENT: PatientContext = { status: "unauthenticated" };

const OK_CLINIC: ClinicContext = {
  status: "ok",
  profile: { id: "p1", firstName: "E2E", lastName: "Admin", email: "e2e@example.com", avatarUrl: null },
  membership: { id: "m1", clinicId: "c1", role: "clinic_admin", status: "active" },
  clinic: { id: "c1", name: "Clínica E2E", slug: "clinica-e2e", logoUrl: null, status: "active" },
  professionalProfile: null,
};

const OK_PATIENT: PatientContext = {
  status: "ok",
  profile: { id: "p2", firstName: "E2E", lastName: "Patient", email: "e2e-patient@example.com", avatarUrl: null },
  patient: {
    id: "pat1",
    firstName: "E2E",
    lastName: "Patient",
    email: null,
    phone: null,
    documentId: null,
    birthDate: null,
    clinicId: "c1",
  },
  clinic: { id: "c1", name: "Clínica E2E", slug: "clinica-e2e", logoUrl: null, phone: null, status: "active" },
};

describe("bridgeAuthenticatedContext", () => {
  it("bridges the clinic session when only clinic context resolves", () => {
    writeSession.mockClear();
    bridgeAuthenticatedContext(OK_CLINIC, UNAUTHENTICATED_PATIENT);
    expect(writeSession).toHaveBeenCalledExactlyOnceWith({ role: "clinic-admin", soloDentistClinic: false });
  });

  it("bridges the patient session when only patient context resolves", () => {
    writeSession.mockClear();
    bridgeAuthenticatedContext(UNAUTHENTICATED_CLINIC, OK_PATIENT);
    expect(writeSession).toHaveBeenCalledExactlyOnceWith({ role: "patient" });
  });

  it("clinic wins when both somehow resolve — matches decideAuthenticatedRedirect's own priority", () => {
    writeSession.mockClear();
    bridgeAuthenticatedContext(OK_CLINIC, OK_PATIENT);
    expect(writeSession).toHaveBeenCalledExactlyOnceWith({ role: "clinic-admin", soloDentistClinic: false });
  });

  it("writes nothing when neither context is real — never fabricates a session", () => {
    writeSession.mockClear();
    bridgeAuthenticatedContext(UNAUTHENTICATED_CLINIC, UNAUTHENTICATED_PATIENT);
    expect(writeSession).not.toHaveBeenCalled();
  });
});
