#!/usr/bin/env node
// Regression for "PROMPT NINJA — Unificar terminología clínica de
// procedimientos": patient_clinical_encounters.treatment (the encounter's
// own free-text summary of what was actually done, built from
// patient_clinical_encounter_procedures — see clinical-encounter-draft.ts's
// buildTreatmentText) was labeled "Tratamiento realizado" in Historia
// Clínica → Atenciones and "Tratamiento:" in the PDF — confusable with the
// still-future Tratamiento/Plan de Tratamiento concept and with the
// treatments catalog's own "Tratamiento" picker (Nueva cita, "Tratamiento
// recomendado"). Both real, non-mock surfaces now read "Procedimientos
// realizados" instead — a label-only change, same field, same data, same
// order.
//
// Uses /dev-qa/patient-record-preview's FIXTURE_ENCOUNTERS[0], whose
// treatment is "Control de ortodoncia, Blanqueamiento dental" — a real
// 2-procedure encounter, per this task's own QA requirement.
//
// The PDF side of this rename (real-clinical-record-document.tsx's
// EncounterRow) reads the exact same `encounter.treatment` value with no
// re-filtering/re-ordering — verified by direct code inspection (both
// consume the identical clinicalEncounters array — see
// patient-clinical-record-screen.tsx), not re-rendered here: generating a
// real PDF requires fetchTeamMembers, which 401s in this unauthenticated
// fixture (see qa-loading-feedback-check.mjs's own PDF scenario), so
// there is nothing meaningful this script could additionally assert on a
// real PDF blob that code inspection doesn't already guarantee.

import puppeteer from "puppeteer-core";
import { assert, attachConsoleMonitor, ensureDevServer, findChrome, stopDevServer } from "./qa-lib.mjs";

const PATIENT_RECORD_URL = "http://localhost:3000/dev-qa/patient-record-preview";

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-procedimientos-terminology-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-procedimientos-terminology-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    console.log('Scenario: Atenciones labels an encounter\'s executed procedures as "Procedimientos realizados", never "Tratamiento"');
    const page = await browser.newPage();
    attachConsoleMonitor(page, failures, {
      extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
    });
    await page.goto(PATIENT_RECORD_URL, { waitUntil: "networkidle0", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 500));

    await page.evaluate(() => {
      Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Atenciones")?.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    const firstEntryText = await page.evaluate(() => {
      const list = document.querySelector("ol.flex.flex-col");
      const firstItem = list?.querySelector("li");
      return firstItem?.textContent ?? null;
    });

    assert(Boolean(firstEntryText), "Atenciones renders at least one encounter entry", failures);
    assert(
      Boolean(firstEntryText && firstEntryText.includes("Procedimientos realizados: Control de ortodoncia, Blanqueamiento dental")),
      "shows the full, unmodified, same-order procedures list under the new label (got: " + JSON.stringify(firstEntryText) + ")",
      failures,
    );
    assert(
      Boolean(firstEntryText && !firstEntryText.includes("Tratamiento realizado") && !firstEntryText.includes("Tratamiento:")),
      "never shows the old, semantically-incorrect 'Tratamiento' label for executed procedures",
      failures,
    );

    await page.close();
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-procedimientos-terminology-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log('\nqa-procedimientos-terminology-check: OK — executed procedures are consistently labeled "Procedimientos realizados".');
}

main().catch((err) => {
  console.error("qa-procedimientos-terminology-check: script error:", err);
  process.exit(2);
});
