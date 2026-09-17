import { describe, expect, it } from "vitest";
import { validateCommercialProspectForm } from "./actions";
import { EMPTY_COMMERCIAL_PROSPECT, type CommercialProspectFormData } from "./types";

// Pure client-side validation for /demo's Prospecto Comercial form —
// tested independently of Supabase, same convention as onboarding's
// account-step validate() and clinic/team-actions.ts's pure decision
// helpers (see their own test files). The real boundary is
// submit_commercial_prospect() (SQL, re-validates independently) — this
// only covers the fast-feedback layer.

const VALID: CommercialProspectFormData = {
  firstName: "Ana",
  lastName: "Gómez",
  clinicName: "Clínica Sonrisa",
  email: "ana@clinicasonrisa.com",
  phone: "+57 300 1234567",
  city: "Bogotá",
};

describe("validateCommercialProspectForm", () => {
  it("a fully valid submission has no errors", () => {
    expect(validateCommercialProspectForm(VALID)).toEqual({});
  });

  it("every field is required", () => {
    const errors = validateCommercialProspectForm(EMPTY_COMMERCIAL_PROSPECT);
    expect(Object.keys(errors).sort()).toEqual(
      ["city", "clinicName", "email", "firstName", "lastName", "phone"].sort(),
    );
  });

  it("whitespace-only input is treated as empty, not valid", () => {
    const errors = validateCommercialProspectForm({ ...VALID, city: "   " });
    expect(errors.city).toBeDefined();
  });

  it("rejects an invalid email while leaving other valid fields untouched", () => {
    const errors = validateCommercialProspectForm({ ...VALID, email: "not-an-email" });
    expect(errors.email).toBeDefined();
    expect(errors.firstName).toBeUndefined();
  });

  it("rejects a first_name longer than the RPC's own 100-char bound", () => {
    const errors = validateCommercialProspectForm({ ...VALID, firstName: "a".repeat(101) });
    expect(errors.firstName).toBeDefined();
  });

  it("accepts a first_name at exactly the 100-char bound", () => {
    const errors = validateCommercialProspectForm({ ...VALID, firstName: "a".repeat(100) });
    expect(errors.firstName).toBeUndefined();
  });

  it("rejects a clinic_name longer than the RPC's own 200-char bound", () => {
    const errors = validateCommercialProspectForm({ ...VALID, clinicName: "a".repeat(201) });
    expect(errors.clinicName).toBeDefined();
  });

  it("rejects a phone longer than the RPC's own 30-char bound", () => {
    const errors = validateCommercialProspectForm({ ...VALID, phone: "1".repeat(31) });
    expect(errors.phone).toBeDefined();
  });

  it("rejects a city longer than the RPC's own 100-char bound", () => {
    const errors = validateCommercialProspectForm({ ...VALID, city: "a".repeat(101) });
    expect(errors.city).toBeDefined();
  });
});
