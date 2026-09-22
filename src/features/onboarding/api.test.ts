import { describe, expect, it } from "vitest";
import { decideRegistroReentry, isValidTaxIdLength, sanitizeTaxId } from "./api";

// Regression coverage for "PROMPT NINJA — Bug: onboarding no puede crear
// clínica": bootstrap_clinic()'s clinics INSERT hits
// clinics_tax_id_format (digits only, 4-12 chars) — a real Colombian NIT
// typed with its customary "-DV" check-digit suffix (or dot thousands
// separators) must never reach that constraint unsanitized, the same way
// src/features/clinic/actions.ts's updateClinicInfo() already normalizes
// this exact column.
describe("sanitizeTaxId", () => {
  it("strips a NIT's customary hyphenated check digit", () => {
    expect(sanitizeTaxId("900123456-7")).toBe("9001234567");
  });

  it("strips dot thousands separators together with the check digit", () => {
    expect(sanitizeTaxId("900.123.456-7")).toBe("9001234567");
  });

  it("leaves a plain-digit NIT unchanged", () => {
    expect(sanitizeTaxId("900123456")).toBe("900123456");
  });

  it("returns null for an empty or whitespace-only value, never an empty string", () => {
    expect(sanitizeTaxId("")).toBeNull();
    expect(sanitizeTaxId("   ")).toBeNull();
  });
});

// Regression coverage for "PROMPT NINJA — Bug: /registro queda en bucle y
// no permite reiniciar onboarding" plus "Checkpoint 1B — Impedir que un
// Paciente sea enviado al onboarding de clínica", updated by "Odentia —
// retirar self-service de /registro y eliminar Confirm Signup"
// (2026-09-21): the exact branch behind the reentry check. Public
// self-service clinic onboarding is retired — the old "account"/"clinic"
// branches (Paso 1 / Paso 2 of a wizard that no longer exists) are both
// replaced by "redirect-to-demo", Odentia's real commercial entry point.
describe("decideRegistroReentry", () => {
  // A — no session: a genuinely new anonymous visitor has nothing to
  // self-service here anymore — /demo is Odentia's real commercial entry
  // point.
  it("a brand-new visitor with no session goes to /demo, never a self-service signup form", () => {
    expect(decideRegistroReentry(false, false, false)).toBe("redirect-to-demo");
  });

  it("no session always wins, even if a stale membership/patient lookup somehow says true", () => {
    expect(decideRegistroReentry(false, true, true)).toBe("redirect-to-demo");
  });

  // B — session + active clinic membership
  it("a real session with an active membership redirects to the product — never a second-clinic attempt, never a dead-end screen", () => {
    expect(decideRegistroReentry(true, true, false)).toBe("redirect-to-product");
  });

  // C — session + Patient access, no clinic membership
  it("a real session with Patient access and no clinic membership redirects to the Patient Portal", () => {
    expect(decideRegistroReentry(true, false, true)).toBe("redirect-to-portal");
  });

  // D — session, neither clinic membership nor Patient access: this used
  // to resume Paso 2 of clinic self-service onboarding; now there is no
  // clinic-creation UI left anywhere in this app for this case to fall
  // through to, so it goes to /demo like a brand-new visitor.
  it("a real session with no active membership and no Patient access goes to /demo — no self-service clinic creation left to resume", () => {
    expect(decideRegistroReentry(true, false, false)).toBe("redirect-to-demo");
  });

  // E — session + both clinic membership and Patient access: clinic wins,
  // same precedence decideAuthenticatedRedirect already establishes.
  it("a real session with BOTH an active membership and Patient access still redirects to the product — clinic membership takes precedence, same as decideAuthenticatedRedirect", () => {
    expect(decideRegistroReentry(true, true, true)).toBe("redirect-to-product");
  });
});

// Regression coverage for "PROMPT NINJA — Fix definitivo: onboarding sigue
// violando clinics_tax_id_format en producción": sanitizeTaxId() already
// guarantees an all-digit result, so length is the only remaining way a
// sanitized value can violate the DB CHECK (4-12 digits) — these mirror
// its exact bounds, checked BEFORE bootstrap_clinic() ever runs.
describe("isValidTaxIdLength", () => {
  it("accepts null (tax_id stays fully optional)", () => {
    expect(isValidTaxIdLength(null)).toBe(true);
  });

  it("accepts a real Colombian NIT with its customary punctuation, once sanitized", () => {
    expect(isValidTaxIdLength(sanitizeTaxId("900.123.456-7"))).toBe(true);
  });

  it("accepts a plain-digit NIT with no punctuation", () => {
    expect(isValidTaxIdLength(sanitizeTaxId("900123456"))).toBe(true);
  });

  it("accepts the exact lower boundary (4 digits)", () => {
    expect(isValidTaxIdLength(sanitizeTaxId("1234"))).toBe(true);
  });

  it("accepts the exact upper boundary (12 digits)", () => {
    expect(isValidTaxIdLength(sanitizeTaxId("123456789012"))).toBe(true);
  });

  it("rejects a value that's too short even after sanitizing — e.g. a QA placeholder", () => {
    expect(isValidTaxIdLength(sanitizeTaxId("123"))).toBe(false);
  });

  it("rejects a value that's too long even after sanitizing — e.g. a phone number pasted by mistake", () => {
    expect(isValidTaxIdLength(sanitizeTaxId("1234567890123"))).toBe(false);
  });
});
