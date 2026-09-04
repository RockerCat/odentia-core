#!/usr/bin/env node
// Regression for the real reported bug: "PROMPT NINJA — Historia Clínica no
// refleja atenciones reales". After completing the real flow (cita →
// Iniciar atención → draft → refresh → continuar → modificar → guardar →
// finalizar), Agenda correctly showed the cita as Completada, but Historia
// Clínica's Resumen tab kept showing "Última atención: Sin atenciones
// registradas" even though the patient had several finalized encounters —
// confirmed against the real remote DB (see this task's own audit): 4
// `completed` appointments, each with its own `patient_clinical_encounters`
// row, ALL with finalized_at set. No missing/orphaned encounter, no draft —
// the data was correct all along.
//
// Root cause (found by reading the actual render path, not guessed):
// ResumenTab (resumen-tab.tsx) hardcoded the "Última atención" card's value
// as the literal string "Sin atenciones registradas", and
// patient-clinical-record-screen.tsx never even passed clinicalEncounters
// into <ResumenTab>. Atenciones (atenciones-tab.tsx) and the PDF
// (pdf/real-clinical-record-data.ts) were both already correct — they
// already consumed the same clinicalEncounters array
// (fetchPatientClinicalEncounters: finalized_at IS NOT NULL, occurred_at
// desc) — only Resumen was disconnected.
//
// Uses /dev-qa/patient-record-preview, whose fixture now carries 2
// finalized encounters shaped exactly like fetchPatientClinicalEncounters'
// own return value (see that page's own comment) — a draft or a
// completed-without-encounter appointment never reaches this far in
// production, proven directly against the query builder in
// clinical-encounters-data.test.ts (npm test), not re-simulated here.

import puppeteer from "puppeteer-core";
import { assert, attachConsoleMonitor, ensureDevServer, findChrome, stopDevServer } from "./qa-lib.mjs";

const PATIENT_RECORD_URL = "http://localhost:3000/dev-qa/patient-record-preview";

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-historia-clinica-ultima-atencion-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-historia-clinica-ultima-atencion-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    console.log('Scenario: Resumen → "Última atención" reflects the most recent FINALIZED encounter, never "Sin atenciones registradas"');
    {
      const page = await browser.newPage();
      // The fixture's odontogram findings (added by the later "Auditar y
      // conectar TODO el Resumen" task) trigger Resumen's own best-effort
      // professional-name resolution (resolveUpdatedByProfessional →
      // fetchTeamMembers), which 401s here without a real session —
      // expected, same allowance as every other unauthenticated fixture
      // read in this suite.
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.goto(PATIENT_RECORD_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 500));

      const ultimaAtencion = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll("div.rounded-xl.border.border-border"));
        const card = cards.find((c) => Array.from(c.querySelectorAll("p")).some((p) => p.textContent.trim() === "Última atención"));
        const value = card?.querySelectorAll("p")[1]?.textContent.trim();
        return value ?? null;
      });
      assert(ultimaAtencion !== null, '"Última atención" card is present in Resumen', failures);
      assert(ultimaAtencion !== "Sin atenciones registradas", 'never shows "Sin atenciones registradas" when finalized encounters exist (the exact reported bug)', failures);
      assert(Boolean(ultimaAtencion && ultimaAtencion.includes("Chequeo general")), 'shows the MOST RECENT finalized encounter (fixture[0], reason "Chequeo general"), not just any encounter', failures);
      await page.close();
    }

    console.log("Scenario: Atenciones lists every finalized encounter, most-recent-first, no duplicates, no fabricated entries");
    {
      const page = await browser.newPage();
      // The fixture's odontogram findings (added by the later "Auditar y
      // conectar TODO el Resumen" task) trigger Resumen's own best-effort
      // professional-name resolution (resolveUpdatedByProfessional →
      // fetchTeamMembers), which 401s here without a real session —
      // expected, same allowance as every other unauthenticated fixture
      // read in this suite.
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.goto(PATIENT_RECORD_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 500));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Atenciones")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      const reasons = await page.evaluate(() => {
        const list = document.querySelector("ol.flex.flex-col");
        if (!list) return null;
        return Array.from(list.querySelectorAll("li")).map((li) => {
          const p = Array.from(li.querySelectorAll("p")).find((el) => el.textContent.includes("Motivo de consulta:"));
          return p?.textContent.replace("Motivo de consulta:", "").trim() ?? null;
        });
      });
      assert(reasons !== null, "Atenciones timeline renders (no empty state) — encounters are not lost", failures);
      assert(reasons && reasons.length === 2, `exactly the 2 finalized encounters from the fixture appear (got ${reasons ? reasons.length : "null"})`, failures);
      assert(Boolean(reasons && reasons[0] === "Chequeo general" && reasons[1] === "Consulta de ortodoncia"), "most-recent-first order (matches occurred_at desc from fetchPatientClinicalEncounters)", failures);
      await page.close();
    }
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-historia-clinica-ultima-atencion-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-historia-clinica-ultima-atencion-check: OK — Resumen/Atenciones agree with the real finalized encounters.");
}

main().catch((err) => {
  console.error("qa-historia-clinica-ultima-atencion-check: script error:", err);
  process.exit(2);
});
