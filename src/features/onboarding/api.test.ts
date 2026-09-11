import { describe, expect, it } from "vitest";
import { buildSignUpRedirectTo, decideRegistroReentry, isValidTaxIdLength, sanitizeTaxId } from "./api";

// Regression coverage for "PROMPT NINJA — Fix Supabase Auth email
// RedirectTo / Confirm Signup": proves signUpAccount()'s own
// emailRedirectTo is built correctly for all three real signup contexts —
// the destination itself, never a "/auth/confirm?next=..." query string
// (see api.ts's own comment on why that shape broke both under Supabase's
// default template and the hand-edited one using {{ .RedirectTo }}).

const ORIGIN = "https://odentia.co";

describe("buildSignUpRedirectTo", () => {
  it("normal signup (/registro, signUpAccount's own default `next`) points directly at /registro", () => {
    expect(buildSignUpRedirectTo(ORIGIN, "/registro")).toBe("https://odentia.co/registro");
  });

  it("team invitation signup points at the exact /invitacion/[token] the link came from", () => {
    expect(buildSignUpRedirectTo(ORIGIN, "/invitacion/abc123")).toBe("https://odentia.co/invitacion/abc123");
  });

  it("patient portal invitation signup points at the exact /portal/invitacion/[token] the link came from", () => {
    expect(buildSignUpRedirectTo(ORIGIN, "/portal/invitacion/xyz789")).toBe("https://odentia.co/portal/invitacion/xyz789");
  });

  it("never builds a query string of its own — the destination IS the path, resolveSafeNext handles the rest on the receiving end", () => {
    expect(buildSignUpRedirectTo(ORIGIN, "/registro")).not.toContain("?");
    expect(buildSignUpRedirectTo(ORIGIN, "/invitacion/abc123")).not.toContain("?");
  });

  it("works with whatever origin the browser is actually on (local dev, not just production)", () => {
    expect(buildSignUpRedirectTo("http://127.0.0.1:3000", "/registro")).toBe("http://127.0.0.1:3000/registro");
  });
});

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
// no permite reiniciar onboarding": the exact 3-way branch behind the
// reentry check, covering all four diagnostic states from that task.
describe("decideRegistroReentry", () => {
  it("a brand-new visitor with no session starts at Paso 1 (account)", () => {
    expect(decideRegistroReentry(false, false)).toBe("account");
  });

  it("no session always wins, even if a stale membership lookup somehow says true", () => {
    expect(decideRegistroReentry(false, true)).toBe("account");
  });

  it("a real session with no active membership resumes at Paso 2 (clinic), never blocked", () => {
    expect(decideRegistroReentry(true, false)).toBe("clinic");
  });

  it("a real session with an active membership redirects to the product — never a second-clinic attempt, never a dead-end screen", () => {
    expect(decideRegistroReentry(true, true)).toBe("redirect-to-product");
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
