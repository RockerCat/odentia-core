#!/usr/bin/env node
// Odentia Core — import an official diagnosis catalog (CIE-10, CIE-11, or
// a future classification) into public.diagnosis_catalog.
//
// Usage:
//   node scripts/rips-import/import-diagnoses.mjs \
//     --file /path/to/cie10.csv \
//     --classification-system CIE10 \
//     --version-label 2026 \
//     --valid-from 2026-01-01 \
//     --source-resolution "..." \
//     --source-url "https://www.sispro.gov.co/..." \
//     [--valid-to 2026-12-31] [--source-document "..."] [--notes "..."]
//
// Expected CSV columns (see docs/rips-catalogs.md): code, description,
// and optionally chapter, category.
//
// classification-system is free text on purpose (see the RIPS 01 audit:
// CIE-10 and CIE-11 currently coexist as parallel active fields in the
// Documento Técnico 1 vigente — this is never a single "cie10_diagnoses"
// table) — pass exactly the value you want stored and later queried by
// (e.g. "CIE10", "CIE11").

import { assertNoBlankValues, assertRequiredColumns, createAdminClient, findDuplicateCodes, parseArgs, parseCsv, printImportSummary, sha256Hex } from "./lib.mjs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  for (const required of ["file", "classification-system", "version-label", "valid-from"]) {
    if (!args[required]) {
      throw new Error(`missing required --${required}`);
    }
  }

  const filePath = args.file;
  const text = await readFile(filePath, "utf8");
  const { headers, rows } = parseCsv(text);

  assertRequiredColumns(headers, ["code", "description"]);
  assertNoBlankValues(rows, ["code", "description"]);

  const duplicates = findDuplicateCodes(rows, "code");
  if (duplicates.length > 0) {
    throw new Error(`duplicate diagnosis code(s) found in source file: ${duplicates.join(", ")}`);
  }

  const checksum = await sha256Hex(filePath);

  const payloadRows = rows.map((row) => ({
    code: row.code,
    description: row.description,
    chapter: row.chapter || null,
    category: row.category || null,
  }));

  const client = createAdminClient();
  const { data, error } = await client.rpc("import_rips_diagnosis_catalog", {
    p_classification_system: args["classification-system"],
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
    throw new Error(`import_rips_diagnosis_catalog failed: ${error.message}`);
  }

  printImportSummary({
    catalogKey: args["classification-system"],
    versionLabel: args["version-label"],
    sourceFile: filePath,
    result: data[0],
  });
}

main().catch((err) => {
  console.error(`\nDiagnosis catalog import failed: ${err.message}`);
  process.exitCode = 1;
});
