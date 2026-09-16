import { describe, expect, it } from "vitest";
import { friendlyProvisionError } from "./api";

// Regression coverage for "PROMPT MASTER — Checkpoint 3": friendlyProvisionError
// is the only pure, directly testable piece of provisionClinic() — the RPC
// call itself (like bootstrap_clinic()'s own client wrapper in
// src/features/onboarding/api.ts) needs a live Supabase client to
// exercise for real, which this repo's test suite doesn't mock for any
// resolver/RPC caller (same existing boundary, not a new gap introduced
// here) — see this checkpoint's own report for what stays manual/DB
// smoke instead.
describe("friendlyProvisionError", () => {
  it("never leaks a raw Postgres/PostgREST error to the user", () => {
    const message = friendlyProvisionError({ message: "insert or update on table \"clinics\" violates constraint" });
    expect(message).not.toMatch(/constraint|postgres|sql/i);
  });

  it("surfaces a clear, safe message when the RPC rejects a non-superadmin caller", () => {
    expect(friendlyProvisionError({ message: "only a platform superadmin can provision a clinic" })).toBe(
      "No tienes permisos de Superadmin para crear una clínica.",
    );
  });

  it("surfaces a clear, safe message for an expired session", () => {
    expect(friendlyProvisionError({ message: "JWT session has expired" })).toBe(
      "Tu sesión expiró. Recarga la página e inicia sesión de nuevo para continuar.",
    );
  });

  it("falls back to a generic safe message for anything else, including a bare Error with no useful text", () => {
    expect(friendlyProvisionError(new Error())).toBe("No pudimos crear la clínica. Intenta de nuevo en unos minutos.");
    expect(friendlyProvisionError("not an object")).toBe("No pudimos crear la clínica. Intenta de nuevo en unos minutos.");
  });
});
