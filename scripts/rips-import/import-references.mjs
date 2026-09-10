#!/usr/bin/env node
// Odentia Core — import one of the Documento Técnico 1 reference tables
// (Sexo, Municipio, ZonaVersion2, TipoNota, RIPSTipoUsuarioVersion2,
// GrupoServicios, Servicios, etc.) into public.rips_reference_values.
//
// One catalog per run — --catalog-key names which one. Run it once per
// official table (see docs/rips-catalogs.md for the list of catalog_key
// values this project expects to need).
//
// Usage:
//   node scripts/rips-import/import-references.mjs \
//     --file /path/to/municipio.csv \
//     --catalog-key Municipio \
//     --version-label 2026 \
//     --valid-from 2026-01-01 \
//     --source-url "https://www.sispro.gov.co/..." \
//     [--valid-to ...] [--source-resolution "..."] [--source-document "..."] [--notes "..."]
//
// Expected CSV columns: code, label, and optionally parent_code (used
// today only for Municipio → Departamento — see docs/rips-catalogs.md
// for why that relationship isn't a formal foreign key yet).

import { assertNoBlankValues, assertRequiredColumns, createAdminClient, findDuplicateCodes, parseArgs, parseCsv, printImportSummary, sha256Hex } from "./lib.mjs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  for (const required of ["file", "catalog-key", "version-label", "valid-from"]) {
    if (!args[required]) {
      throw new Error(`missing required --${required}`);
    }
  }

  const filePath = args.file;
  const text = await readFile(filePath, "utf8");
  const { headers, rows } = parseCsv(text);

  assertRequiredColumns(headers, ["code", "label"]);
  assertNoBlankValues(rows, ["code", "label"]);

  const duplicates = findDuplicateCodes(rows, "code");
  if (duplicates.length > 0) {
    throw new Error(`duplicate code(s) found in source file for catalog "${args["catalog-key"]}": ${duplicates.join(", ")}`);
  }

  const checksum = await sha256Hex(filePath);

  const payloadRows = rows.map((row) => ({
    code: row.code,
    label: row.label,
    parent_code: row.parent_code || null,
  }));

  const client = createAdminClient();
  const { data, error } = await client.rpc("import_rips_reference_values", {
    p_catalog_key: args["catalog-key"],
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
    throw new Error(`import_rips_reference_values failed: ${error.message}`);
  }

  printImportSummary({
    catalogKey: args["catalog-key"],
    versionLabel: args["version-label"],
    sourceFile: filePath,
    result: data[0],
  });
}

main().catch((err) => {
  console.error(`\nReference catalog import failed: ${err.message}`);
  process.exitCode = 1;
});
