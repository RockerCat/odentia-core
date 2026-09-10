#!/usr/bin/env node
// Odentia Core — import the official CUPS (Clasificación Única de
// Procedimientos en Salud) catalog into public.cups_catalog.
//
// Usage:
//   node scripts/rips-import/import-cups.mjs \
//     --file /path/to/cups-2026.csv \
//     --version-label 2026 \
//     --valid-from 2026-01-01 \
//     --source-resolution "Resolución 2706 de 2025" \
//     --source-url "https://www.sispro.gov.co/..." \
//     [--valid-to 2026-12-31] \
//     [--source-document "CUPS 2026"] \
//     [--source-published-at 2025-12-23] \
//     [--notes "..."]
//
// Expected CSV columns (UTF-8, comma-separated, header row — see
// docs/rips-catalogs.md): code, description, and optionally chapter,
// section, category, rips_service_type ("consultation"/"procedure",
// omit or leave blank for "unknown"), rips_service_type_source (REQUIRED
// whenever rips_service_type is not blank — must cite the official
// structure/rule used to derive it, never a guess — see the RIPS 01
// audit's Section 12 on why CUPS 890304 must never be assumed to be a
// procedure just because it looks like one).
//
// This script does not exist in this session's Odentia checkout with a
// real CUPS file to import — see the implementation report's Section 17
// (Real Catalog Data Status: infrastructure complete, official file not
// yet supplied).

import { assertNoBlankValues, assertRequiredColumns, createAdminClient, findDuplicateCodes, parseArgs, parseCsv, printImportSummary, sha256Hex } from "./lib.mjs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const VALID_SERVICE_TYPES = new Set(["consultation", "procedure", "unknown", ""]);

async function main() {
  const args = parseArgs(process.argv.slice(2));

  for (const required of ["file", "version-label", "valid-from"]) {
    if (!args[required]) {
      throw new Error(`missing required --${required}`);
    }
  }

  const filePath = args.file;
  const text = await readFile(filePath, "utf8");
  const { headers, rows } = parseCsv(text);

  assertRequiredColumns(headers, ["code", "description"]);
  assertNoBlankValues(rows, ["code", "description"]);

  for (const [index, row] of rows.entries()) {
    const serviceType = row.rips_service_type ?? "";
    if (!VALID_SERVICE_TYPES.has(serviceType)) {
      throw new Error(`row ${index + 2}: rips_service_type "${serviceType}" must be one of consultation, procedure, unknown, or blank`);
    }
    if (serviceType && serviceType !== "unknown" && !row.rips_service_type_source) {
      throw new Error(
        `row ${index + 2}: rips_service_type_source is required when rips_service_type is "${serviceType}" — ` +
          `document the official rule/structure that justifies the classification, never leave it unsourced ` +
          `(see the RIPS 01 audit's Section 12: never classify a CUPS code by text heuristics)`,
      );
    }
  }

  const duplicates = findDuplicateCodes(rows, "code");
  if (duplicates.length > 0) {
    throw new Error(`duplicate CUPS code(s) found in source file: ${duplicates.join(", ")}`);
  }

  const checksum = await sha256Hex(filePath);

  const payloadRows = rows.map((row) => ({
    code: row.code,
    description: row.description,
    chapter: row.chapter || null,
    section: row.section || null,
    category: row.category || null,
    rips_service_type: row.rips_service_type || "unknown",
    rips_service_type_source: row.rips_service_type_source || null,
  }));

  const client = createAdminClient();
  const { data, error } = await client.rpc("import_rips_cups_catalog", {
    p_version_label: args["version-label"],
    p_valid_from: args["valid-from"],
    p_rows: payloadRows,
    p_valid_to: args["valid-to"] || null,
    p_source_resolution: args["source-resolution"] || null,
    p_source_document: args["source-document"] || null,
    p_source_url: args["source-url"] || null,
    p_source_file_name: basename(filePath),
    p_source_checksum: checksum,
    p_source_published_at: args["source-published-at"] || null,
    p_imported_by: `cli:${basename(new URL(import.meta.url).pathname)}`,
    p_notes: args.notes || null,
  });

  if (error) {
    throw new Error(`import_rips_cups_catalog failed: ${error.message}`);
  }

  printImportSummary({
    catalogKey: "CUPS",
    versionLabel: args["version-label"],
    sourceFile: filePath,
    result: data[0],
  });
}

main().catch((err) => {
  console.error(`\nCUPS import failed: ${err.message}`);
  process.exitCode = 1;
});
