import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { PersonalizedHeading } from "@/components/personalized-heading";
import type { ClinicContext } from "@/features/session/types";
import { toShellIdentity } from "./use-shell-identity";

// Pilot E2E: "Laura" (the dev mock Assistant, CURRENT_ASSISTANT "Laura
// Torres") appeared in the real shell — useShellIdentity fell back to the
// mock identity whenever the real context was still loading or failed.

const MOCK_IDENTITY_STRINGS = ["Laura Torres", "María Gómez", "Mateo Peña", "Valeria Muñoz", "Clínica Sonrisa Perfecta", "randomuser.me"];

const OK: ClinicContext = {
  status: "ok",
  profile: { id: "u1", firstName: "Admin", lastName: "Borcelle 2", email: "a@b.co", phone: null, avatarUrl: null },
  membership: { id: "m1", clinicId: "c1", role: "assistant", status: "active" },
  clinic: { id: "c1", name: "Clinica Borcelle 2", slug: "borcelle-2", logoUrl: null, status: "active" },
  professionalProfile: null,
};

function assertNoMock(identity: object) {
  const text = JSON.stringify(identity);
  for (const s of MOCK_IDENTITY_STRINGS) expect(text).not.toContain(s);
}

describe("toShellIdentity — real only, never mock", () => {
  it("loading → loading state with no name at all (callers render a skeleton)", () => {
    const identity = toShellIdentity({ state: "loading" });
    expect(identity).toMatchObject({ status: "loading", name: "", initials: "", secondaryLabel: "" });
    expect(identity.avatar_url).toBeUndefined();
    assertNoMock(identity);
  });

  it("failed resolution or a non-ok context → neutral 'unavailable', never a fallback person", () => {
    for (const identity of [
      toShellIdentity({ state: "error" }),
      toShellIdentity({ state: "ready", context: { status: "no-membership" } }),
      toShellIdentity({ state: "ready", context: { status: "membership-inactive" } }),
    ]) {
      expect(identity).toMatchObject({ status: "unavailable", name: "", initials: "", secondaryLabel: "" });
      assertNoMock(identity);
    }
  });

  it("ready → exactly the real profile/clinic; no avatar means no stock photo", () => {
    const identity = toShellIdentity({ state: "ready", context: OK });
    expect(identity).toEqual({
      status: "ready",
      name: "Admin Borcelle 2",
      initials: "AB",
      avatar_url: undefined,
      secondaryLabel: "Clinica Borcelle 2",
      hasActiveProfessionalProfile: false,
    });
  });

  it("Perfil routing comes from the real ACTIVE professional profile", () => {
    expect(toShellIdentity({ state: "ready", context: { ...OK, professionalProfile: { id: "p1", active: true } } }).hasActiveProfessionalProfile).toBe(true);
    expect(toShellIdentity({ state: "ready", context: { ...OK, professionalProfile: { id: "p1", active: false } } }).hasActiveProfessionalProfile).toBe(false);
  });
});

describe("PersonalizedHeading (greetings)", () => {
  function childrenOf(el: ReactElement): unknown[] {
    const children = (el.props as { children?: unknown }).children;
    return Array.isArray(children) ? children : [children];
  }

  it("loading renders a skeleton in place of the name, never a placeholder name", () => {
    const el = PersonalizedHeading({ before: "Hola ", userName: "", after: ", esta es la agenda para hoy.", loading: true });
    const parts = childrenOf(el).filter(isValidElement) as ReactElement<{ className?: string; children?: unknown }>[];
    expect(parts.some((p) => p.props.className?.includes("animate-pulse"))).toBe(true);
    expect(JSON.stringify(parts.map((p) => p.props.children))).not.toMatch(/Laura|María/);
  });

  it("no real name available → drops it cleanly instead of inventing one", () => {
    const el = PersonalizedHeading({ before: "Hola ", userName: "", after: ", esta es la agenda para hoy." });
    expect((el.props as { children: string }).children).toBe("Hola, esta es la agenda para hoy.");
  });

  it("real name renders as before", () => {
    const el = PersonalizedHeading({ before: "Hola ", userName: "Admin", after: ", esta es la agenda para hoy." });
    expect(JSON.stringify(childrenOf(el).map((c) => (isValidElement(c) ? (c.props as { children: unknown }).children : c)))).toContain("Admin");
  });
});
