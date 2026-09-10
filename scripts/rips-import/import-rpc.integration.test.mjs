// Odentia Core — integration coverage for the import_rips_*_catalog RPCs
// (versioning, idempotency, transactionality — see the RIPS 02
// implementation report's Sections 15/16 and 22's Casos 1-7).
//
// Requires a REAL Supabase project reachable with NEXT_PUBLIC_SUPABASE_URL
// + SUPABASE_SERVICE_ROLE_KEY (this migration applied to it) — there was
// no Docker/local Postgres in the RIPS 02/02A implementation/review
// sessions, so this suite could not be executed then. It WAS run for
// real, live, against the linked remote Odentia project, during the
// RIPS 02B smoke test (all 6 cases passed) — run it again the same way
// with `NODE_OPTIONS=--experimental-websocket node --env-file=.env.local
// node_modules/.bin/vitest run scripts/rips-import/import-rpc.integration.test.mjs`
// on Node <22 (the `--experimental-websocket` flag/NODE_OPTIONS is only
// needed below Node 22, where `WebSocket` isn't a global yet — see
// `@supabase/supabase-js`'s own error message if you skip it).
//
// Every catalog_key/code here is a clearly-fake TEST fixture — never a
// real Colombian regulatory code — and this suite only ever writes rows
// under catalog_key 'TEST_REFERENCE', which no real RIPS field will ever
// reference.

import { afterAll, describe, expect, it } from "vitest";
import { createAdminClient } from "./lib.mjs";

const canRunLive = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const CATALOG_KEY = "TEST_REFERENCE";

describe.skipIf(!canRunLive)("import_rips_reference_values (live Supabase project required)", () => {
  const client = canRunLive ? createAdminClient() : null;

  afterAll(async () => {
    if (!client) return;
    // Best-effort cleanup — never touches a real catalog_key. NOTE
    // (found during the RIPS 02B smoke test): `service_role` is
    // deliberately never granted DELETE on these tables — no
    // import_rips_*_catalog function ever deletes a row (superseding a
    // version is an UPDATE, see 20260910090000's own design note), so
    // there was never a reason to grant it. That means these two
    // deletes WILL fail with a permission error every time this suite
    // runs against a real project, leaving TEST_REFERENCE fixture rows
    // behind — confirmed live. Logging the failure (rather than
    // ignoring it, as before) so that's visible instead of silent;
    // actually removing the leftover fixture rows requires elevated
    // (table-owner/postgres-level) access, e.g. `supabase db query
    // --linked "delete from ... where catalog_key = 'TEST_REFERENCE'"`,
    // not the service_role key this suite otherwise uses throughout.
    const refDelete = await client.from("rips_reference_values").delete().eq("catalog_key", CATALOG_KEY);
    const importDelete = await client.from("rips_catalog_imports").delete().eq("catalog_key", CATALOG_KEY);
    if (refDelete.error || importDelete.error) {
      console.warn(
        "afterAll cleanup could not delete TEST_REFERENCE fixture rows (service_role has no DELETE grant, by design) " +
          "— remove them manually with elevated access. Errors:",
        refDelete.error?.message,
        importDelete.error?.message,
      );
    }
  });

  it("Caso 1: initial import creates the version and every row", async () => {
    const { data, error } = await client.rpc("import_rips_reference_values", {
      p_catalog_key: CATALOG_KEY,
      p_version_label: "v1",
      p_valid_from: "2026-01-01",
      p_rows: [
        { code: "T1", label: "Test one" },
        { code: "T2", label: "Test two" },
      ],
    });
    expect(error).toBeNull();
    expect(data[0]).toMatchObject({ inserted_count: 2, updated_count: 0, total_count: 2 });
  });

  it("Caso 2: re-importing the identical file is idempotent — same row count, no duplicates", async () => {
    const { data, error } = await client.rpc("import_rips_reference_values", {
      p_catalog_key: CATALOG_KEY,
      p_version_label: "v1",
      p_valid_from: "2026-01-01",
      p_rows: [
        { code: "T1", label: "Test one" },
        { code: "T2", label: "Test two" },
      ],
    });
    expect(error).toBeNull();
    // Every row already existed for this (catalog_key, code, version) —
    // ON CONFLICT DO UPDATE fires for all of them (see the report's
    // Section 11 for why "updated" here doesn't imply the values
    // actually changed), inserted stays 0, and the underlying table
    // still has exactly 2 rows for this version (checked below).
    expect(data[0]).toMatchObject({ inserted_count: 0, updated_count: 2, total_count: 2 });

    const { data: rows } = await client
      .from("rips_reference_values")
      .select("code")
      .eq("catalog_key", CATALOG_KEY)
      .eq("version_label", "v1");
    expect(rows).toHaveLength(2);
  });

  it("Caso 3: a new version adds a code without touching the previous version's rows", async () => {
    const { error } = await client.rpc("import_rips_reference_values", {
      p_catalog_key: CATALOG_KEY,
      p_version_label: "v2",
      p_valid_from: "2026-06-01",
      p_rows: [
        { code: "T1", label: "Test one (v2 wording)" },
        { code: "T2", label: "Test two" },
        { code: "T3", label: "Test three (new in v2)" },
      ],
    });
    expect(error).toBeNull();

    const { data: v1Rows } = await client
      .from("rips_reference_values")
      .select("code, status, valid_to")
      .eq("catalog_key", CATALOG_KEY)
      .eq("version_label", "v1");
    expect(v1Rows).toHaveLength(2);
    // Caso 4 (retiring codes) is exercised implicitly here too: v1 is
    // fully superseded, never deleted — its 2 rows are still readable.
    expect(v1Rows.every((r) => r.status === "superseded" && r.valid_to === "2026-05-31")).toBe(true);

    const { data: v2Rows } = await client
      .from("rips_reference_values")
      .select("code, status")
      .eq("catalog_key", CATALOG_KEY)
      .eq("version_label", "v2");
    expect(v2Rows).toHaveLength(3);
    expect(v2Rows.every((r) => r.status === "active")).toBe(true);

    const { data: imports } = await client
      .from("rips_catalog_imports")
      .select("version_label, status")
      .eq("catalog_key", CATALOG_KEY);
    expect(imports).toContainEqual({ version_label: "v1", status: "superseded" });
    expect(imports).toContainEqual({ version_label: "v2", status: "active" });
  });

  it("Caso 5: a code changing its label within the SAME version is visible immediately (no duplicate row)", async () => {
    await client.rpc("import_rips_reference_values", {
      p_catalog_key: CATALOG_KEY,
      p_version_label: "v2",
      p_valid_from: "2026-06-01",
      p_rows: [
        { code: "T1", label: "Test one (corrected wording)" },
        { code: "T2", label: "Test two" },
        { code: "T3", label: "Test three (new in v2)" },
      ],
    });

    const { data: rows } = await client
      .from("rips_reference_values")
      .select("label")
      .eq("catalog_key", CATALOG_KEY)
      .eq("version_label", "v2")
      .eq("code", "T1")
      .single();
    expect(rows.label).toBe("Test one (corrected wording)");
  });

  it("Caso 7: a duplicate code within the same payload is rejected, nothing is persisted", async () => {
    const { error } = await client.rpc("import_rips_reference_values", {
      p_catalog_key: CATALOG_KEY,
      p_version_label: "v3-rejected",
      p_valid_from: "2027-01-01",
      p_rows: [
        { code: "T1", label: "Duplicate attempt" },
        { code: "T1", label: "Duplicate attempt again" },
      ],
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/duplicate codes/i);

    const { data: imports } = await client
      .from("rips_catalog_imports")
      .select("id")
      .eq("catalog_key", CATALOG_KEY)
      .eq("version_label", "v3-rejected");
    // Caso 6/23 — transactionality: the rejected call must not have left a
    // half-created import row behind.
    expect(imports).toHaveLength(0);
  });

  it("Caso 6: a missing required field is rejected, nothing is persisted", async () => {
    const { error } = await client.rpc("import_rips_reference_values", {
      p_catalog_key: CATALOG_KEY,
      p_version_label: "v4-rejected",
      p_valid_from: "2027-01-01",
      p_rows: [{ code: "T5", label: "" }],
    });
    expect(error).not.toBeNull();

    const { data: imports } = await client
      .from("rips_catalog_imports")
      .select("id")
      .eq("catalog_key", CATALOG_KEY)
      .eq("version_label", "v4-rejected");
    expect(imports).toHaveLength(0);
  });
});
