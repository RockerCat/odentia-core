import { describe, expect, it } from "vitest";
import { decidePlatformRedirect } from "./proxy";
import type { SuperadminContext } from "@/features/session/types";

// Regression coverage for "PROMPT MASTER — Checkpoint 2: identidad real
// SUPERADMIN + acceso protegido a /platform" — proxy.ts's own
// PRIVATE_PLATFORM_PATHS gate. Mirrors decide-clinic-redirect.test.ts's
// own convention for decideClinicRedirect.

const OK: SuperadminContext = {
  status: "ok",
  profile: { id: "p1", firstName: "Ana", lastName: "Superadmin", email: "ana@odentia.co", avatarUrl: null },
};

describe("decidePlatformRedirect", () => {
  it("a real superadmin never redirects — /platform renders", () => {
    expect(decidePlatformRedirect(OK)).toBeNull();
  });

  it("unauthenticated goes to /login", () => {
    expect(decidePlatformRedirect({ status: "unauthenticated" })).toBe("/login");
  });

  it("authenticated but not a real superadmin goes to the honest restricted screen, never Platform content", () => {
    expect(decidePlatformRedirect({ status: "not-superadmin" })).toBe("/acceso-restringido?motivo=no-superadmin");
  });
});
