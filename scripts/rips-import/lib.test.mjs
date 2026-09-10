import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assertNoBlankValues, assertRequiredColumns, findDuplicateCodes, parseArgs, parseCsv } from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Pure-logic coverage for the RIPS catalog importers — no database, no
// network. The DB-touching behavior (idempotency, versioning,
// transactionality) is covered separately by
// scripts/rips-import/import-rpc.integration.test.mjs, which requires a
// live Supabase project and is skipped otherwise (see that file's own
// header comment and the implementation report's Section 15/16).

describe("parseCsv", () => {
  it("parses a simple header + rows file", () => {
    const { headers, rows } = parseCsv("code,label\nA1,Alpha\nB2,Beta\n");
    expect(headers).toEqual(["code", "label"]);
    expect(rows).toEqual([
      { code: "A1", label: "Alpha" },
      { code: "B2", label: "Beta" },
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const { rows } = parseCsv('code,label\nA1,"Alpha, first"\n');
    expect(rows).toEqual([{ code: "A1", label: "Alpha, first" }]);
  });

  it("handles escaped quotes inside a quoted field", () => {
    const { rows } = parseCsv('code,label\nA1,"Say ""hi"""\n');
    expect(rows).toEqual([{ code: "A1", label: 'Say "hi"' }]);
  });

  it("handles an embedded newline inside a quoted field", () => {
    const { rows } = parseCsv('code,label\nA1,"line one\nline two"\n');
    expect(rows).toEqual([{ code: "A1", label: "line one\nline two" }]);
  });

  it("handles CRLF line endings", () => {
    const { rows } = parseCsv("code,label\r\nA1,Alpha\r\n");
    expect(rows).toEqual([{ code: "A1", label: "Alpha" }]);
  });

  it("handles a file with no trailing newline", () => {
    const { rows } = parseCsv("code,label\nA1,Alpha");
    expect(rows).toEqual([{ code: "A1", label: "Alpha" }]);
  });

  it("returns empty headers/rows for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });

  it("trims whitespace around header and field values", () => {
    const { headers, rows } = parseCsv(" code , label \n A1 , Alpha \n");
    expect(headers).toEqual(["code", "label"]);
    expect(rows).toEqual([{ code: "A1", label: "Alpha" }]);
  });
});

describe("assertRequiredColumns", () => {
  it("does not throw when every required column is present", () => {
    expect(() => assertRequiredColumns(["code", "description", "extra"], ["code", "description"])).not.toThrow();
  });

  it("throws naming every missing column", () => {
    expect(() => assertRequiredColumns(["code"], ["code", "description", "chapter"])).toThrow(
      /missing required column\(s\): description, chapter/,
    );
  });
});

describe("assertNoBlankValues", () => {
  it("does not throw when all required fields are populated", () => {
    expect(() => assertNoBlankValues([{ code: "A1", description: "x" }], ["code", "description"])).not.toThrow();
  });

  it("throws citing the human-facing row number of the first blank value", () => {
    const rows = [
      { code: "A1", description: "x" },
      { code: "", description: "y" },
    ];
    // Row 2 in the data maps to file row 3 (row 1 is the header).
    expect(() => assertNoBlankValues(rows, ["code"])).toThrow(/row 3 has an empty value for required field "code"/);
  });
});

describe("findDuplicateCodes", () => {
  it("returns an empty array when every code is unique", () => {
    expect(findDuplicateCodes([{ code: "A1" }, { code: "B2" }])).toEqual([]);
  });

  it("returns each code that appears more than once, once each", () => {
    expect(findDuplicateCodes([{ code: "A1" }, { code: "A1" }, { code: "A1" }, { code: "B2" }])).toEqual(["A1"]);
  });
});

describe("parseArgs", () => {
  it("parses --flag value pairs", () => {
    expect(parseArgs(["--file", "a.csv", "--version-label", "2026"])).toEqual({
      file: "a.csv",
      "version-label": "2026",
    });
  });

  it("treats a flag with no following value (or followed by another flag) as boolean true", () => {
    expect(parseArgs(["--dry-run", "--file", "a.csv"])).toEqual({ "dry-run": "true", file: "a.csv" });
    expect(parseArgs(["--dry-run"])).toEqual({ "dry-run": "true" });
  });
});

describe("fixture file: cups-sample.csv", () => {
  it("parses with the expected columns and rows, end to end", async () => {
    const text = await readFile(join(__dirname, "fixtures", "cups-sample.csv"), "utf8");
    const { headers, rows } = parseCsv(text);

    assertRequiredColumns(headers, ["code", "description"]);
    assertNoBlankValues(rows, ["code", "description"]);
    expect(findDuplicateCodes(rows, "code")).toEqual([]);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      code: "TEST001",
      rips_service_type: "consultation",
    });
    expect(rows[2].rips_service_type).toBe("");
    // Every code in this fixture is a clearly-fake TEST### placeholder —
    // never a real CUPS/CIE code (see docs/rips-catalogs.md's fixtures
    // policy).
    for (const row of rows) {
      expect(row.code).toMatch(/^TEST\d+$/);
    }
  });
});
