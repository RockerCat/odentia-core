import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnyPatientLink } from "./has-patient-link";

// Fake chainable PostgREST-shaped client, same style as
// src/features/patients/clinical-encounters-data.test.ts's own
// fakeSupabase() — records calls so assertions read the actual
// filter arguments this function sends, and resolves the final `.eq()`
// with the {count, error} shape a real `{ count: "exact", head: true }`
// select produces.
function fakeSupabase(options: { userId: string | null; count: number | null; error?: { message: string } | null }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain = {
    from(...args: unknown[]) {
      calls.push({ method: "from", args });
      return chain;
    },
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return chain;
    },
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return Promise.resolve({ count: options.count, error: options.error ?? null });
    },
  };
  const client = {
    ...chain,
    auth: {
      getUser: () => Promise.resolve({ data: { user: options.userId ? { id: options.userId } : null } }),
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("hasAnyPatientLink", () => {
  it("returns false when there is no authenticated user", async () => {
    const { client } = fakeSupabase({ userId: null, count: 5 });
    expect(await hasAnyPatientLink(client)).toBe(false);
  });

  it("returns true when at least one patient_user_links row exists", async () => {
    const { client, calls } = fakeSupabase({ userId: "profile-1", count: 1 });
    expect(await hasAnyPatientLink(client)).toBe(true);
    expect(calls).toContainEqual({ method: "from", args: ["patient_user_links"] });
    expect(calls).toContainEqual({ method: "eq", args: ["profile_id", "profile-1"] });
  });

  it("returns true regardless of HOW MANY links exist — never selects/chooses one", async () => {
    const { client } = fakeSupabase({ userId: "profile-1", count: 3 });
    expect(await hasAnyPatientLink(client)).toBe(true);
  });

  it("returns false when zero patient_user_links rows exist", async () => {
    const { client } = fakeSupabase({ userId: "profile-1", count: 0 });
    expect(await hasAnyPatientLink(client)).toBe(false);
  });

  it("throws on a genuine query error rather than silently resolving false", async () => {
    const { client } = fakeSupabase({ userId: "profile-1", count: null, error: { message: "boom" } });
    await expect(hasAnyPatientLink(client)).rejects.toBeTruthy();
  });
});
