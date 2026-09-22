import { describe, expect, it } from "vitest";
import { friendlyClinicCommercialStatusError } from "./clinic-commercial-actions";

describe("friendlyClinicCommercialStatusError", () => {
  it("never leaks a raw Postgres/PostgREST error to the user", () => {
    const message = friendlyClinicCommercialStatusError({
      message: 'update or delete on table "clinics" violates row-level security policy',
    });
    expect(message).not.toMatch(/postgres|row-level|sql/i);
  });

  it("surfaces a clear, safe message when the RPC rejects a non-superadmin caller", () => {
    expect(
      friendlyClinicCommercialStatusError({
        message: "only a platform superadmin can change a clinic's commercial status",
      }),
    ).toBe("No tienes permisos de Superadmin para cambiar el estado comercial de esta clínica.");
  });

  it("surfaces a clear, safe message for an expired session", () => {
    expect(friendlyClinicCommercialStatusError({ message: "JWT session has expired" })).toBe(
      "Tu sesión expiró. Recarga la página e inicia sesión de nuevo para continuar.",
    );
  });

  it("surfaces a clear, safe message when the clinic can't be found", () => {
    expect(friendlyClinicCommercialStatusError({ message: "clinic not found" })).toBe(
      "No encontramos esta clínica. Recarga la página e intenta de nuevo.",
    );
  });

  it("falls back to a generic safe message for anything else", () => {
    expect(friendlyClinicCommercialStatusError(new Error())).toBe(
      "No pudimos actualizar el estado comercial. Intenta de nuevo en unos minutos.",
    );
    expect(friendlyClinicCommercialStatusError("not an object")).toBe(
      "No pudimos actualizar el estado comercial. Intenta de nuevo en unos minutos.",
    );
  });
});
