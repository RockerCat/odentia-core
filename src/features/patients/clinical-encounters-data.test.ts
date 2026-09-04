import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPatientClinicalEncounters } from "./clinical-encounters-data";

// Proves, against the real production query builder (not a guess), the
// two rules Historia Clínica depends on for "Última atención"/Atenciones/
// PDF to ever be correct: a draft (finalized_at null) is excluded at the
// query level, and rows come back most-recent-first. A fake chainable
// PostgREST-shaped client records every call so the assertions read the
// actual filter/order arguments this function sends, not just its output.
function fakeSupabase(rows: unknown[]) {
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
      return chain;
    },
    not(...args: unknown[]) {
      calls.push({ method: "not", args });
      return chain;
    },
    order(...args: unknown[]) {
      calls.push({ method: "order", args });
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return { client: chain as unknown as SupabaseClient, calls };
}

describe("fetchPatientClinicalEncounters", () => {
  it("filters to finalized_at IS NOT NULL — a draft can never be returned to Historia Clínica", async () => {
    const { client, calls } = fakeSupabase([]);
    await fetchPatientClinicalEncounters(client, "clinic-1", "patient-1");
    expect(calls).toContainEqual({ method: "not", args: ["finalized_at", "is", null] });
  });

  it("orders by occurred_at descending — most recent finalized encounter first", async () => {
    const { client, calls } = fakeSupabase([]);
    await fetchPatientClinicalEncounters(client, "clinic-1", "patient-1");
    expect(calls).toContainEqual({ method: "order", args: ["occurred_at", { ascending: false }] });
  });

  it("scopes to the exact clinic_id + patient_id passed in — never cross-tenant, never a different patient", async () => {
    const { client, calls } = fakeSupabase([]);
    await fetchPatientClinicalEncounters(client, "clinic-1", "patient-1");
    expect(calls).toContainEqual({ method: "eq", args: ["clinic_id", "clinic-1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["patient_id", "patient-1"] });
  });

  it("never fabricates an encounter — only ever maps rows Postgres actually returned", async () => {
    const { client } = fakeSupabase([]);
    const result = await fetchPatientClinicalEncounters(client, "clinic-1", "patient-1");
    expect(result).toEqual([]);
  });
});
