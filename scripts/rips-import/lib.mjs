// Odentia Core — RIPS catalog import: shared helpers.
//
// Used by import-cups.mjs / import-diagnoses.mjs / import-references.mjs
// (and exercised directly, with no live Supabase project, by
// scripts/rips-import/lib.test.mjs). Kept dependency-free on purpose: the
// project has no CSV/XLSX parsing library today (see the RIPS 02
// implementation report's Section 17 for why a CSV contract was chosen
// over adding a new dependency), and this file's parsing/validation
// pieces are small and self-contained enough that a hand-rolled,
// well-tested RFC4180 parser is safer than a speculative new dependency
// for a regulatory-correctness-critical pipeline.
//
// Every function here is pure except createAdminClient() (reads env) and
// sha256Hex() (reads a file) — kept that way specifically so vitest can
// exercise the parsing/validation logic without a database.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

/**
 * Minimal RFC4180 CSV parser: handles quoted fields, embedded commas,
 * embedded newlines inside quotes, and escaped quotes ("" inside a quoted
 * field). Deliberately does NOT try to sniff delimiters/encodings — the
 * documented input contract (see docs/rips-catalogs.md) is UTF-8, comma-
 * separated, with a header row.
 *
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  // Normalize CRLF to LF up front so the state machine only ever sees \n —
  // safe because we handle embedded newlines via inQuotes, not by
  // splitting on \n beforehand.
  const input = text.replace(/\r\n/g, "\n");

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  // Trailing field/row (a file without a final newline).
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  const nonEmptyRows = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = nonEmptyRows[0].map((h) => h.trim());
  const dataRows = nonEmptyRows.slice(1).map((values) => {
    /** @type {Record<string, string>} */
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] ?? "").trim();
    });
    return record;
  });

  return { headers, rows: dataRows };
}

/**
 * Throws a clear error naming every missing required column — never lets
 * a structurally wrong file reach the database (see "Caso 6: archivo
 * corrupto o estructura inesperada" in the RIPS 02 implementation report).
 *
 * @param {string[]} headers
 * @param {string[]} required
 */
export function assertRequiredColumns(headers, required) {
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(
      `source file is missing required column(s): ${missing.join(", ")} (found: ${headers.join(", ") || "<empty file>"})`,
    );
  }
}

/**
 * Returns the list of codes that appear more than once in `rows` — a
 * duplicate code within a single source file is always an error, never
 * silently resolved by "last one wins" (see "Caso 7" in the report).
 *
 * @param {Record<string, string>[]} rows
 * @param {string} codeField
 * @returns {string[]}
 */
export function findDuplicateCodes(rows, codeField = "code") {
  const counts = new Map();
  for (const row of rows) {
    const code = row[codeField];
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([code]) => code);
}

/**
 * Throws if any row has an empty value for one of `fields`.
 *
 * @param {Record<string, string>[]} rows
 * @param {string[]} fields
 */
export function assertNoBlankValues(rows, fields) {
  rows.forEach((row, index) => {
    for (const field of fields) {
      if (!row[field]) {
        // 1-based, human-facing row number (header row is row 1).
        throw new Error(`row ${index + 2} has an empty value for required field "${field}"`);
      }
    }
  });
}

/**
 * sha256 of a file's raw bytes — stored as rips_catalog_imports.source_checksum
 * so a later run can confirm it started from the exact same official file.
 *
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function sha256Hex(filePath) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Supabase admin client — the ONLY client in this codebase that uses the
 * service_role key, and it must never be imported by anything other than
 * a scripts/rips-import-*.mjs CLI script (never by src/** app code — see
 * src/lib/supabase/client.ts and server.ts, which deliberately only ever
 * use the publishable/anon key). Reads SUPABASE_SERVICE_ROLE_KEY, which
 * is NOT prefixed with NEXT_PUBLIC_ specifically so it can never end up
 * in a browser bundle even by accident.
 *
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "createAdminClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment — " +
        "see docs/rips-catalogs.md. Never commit the service role key; export it in your shell or a local, " +
        "gitignored .env.rips-import file instead.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Minimal `--flag value` CLI arg parser — no new dependency for a
 * handful of named options. Returns {} values as strings; callers convert
 * (dates, etc.) themselves.
 *
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        args[key] = "true";
      } else {
        args[key] = value;
        i++;
      }
    }
  }
  return args;
}

/**
 * Prints the standard post-import summary. Kept as one shared function so
 * all three importers report in the same shape.
 *
 * @param {{ catalogKey: string, versionLabel: string, sourceFile: string, result: { import_id: string, inserted_count: number, updated_count: number, total_count: number } }} args
 */
export function printImportSummary({ catalogKey, versionLabel, sourceFile, result }) {
  const unchanged = result.total_count - result.inserted_count - result.updated_count;
  console.log(`\nRIPS catalog import — ${catalogKey} ${versionLabel}`);
  console.log(`Source file: ${sourceFile}`);
  console.log(`Import id:   ${result.import_id}`);
  console.log(`Imported:    ${result.total_count}`);
  console.log(`Added:       ${result.inserted_count}`);
  console.log(`Updated:     ${result.updated_count}`);
  console.log(`Unchanged:   ${unchanged}`);
}
