#!/usr/bin/env node
// Regression for "PROMPT NINJA — Auditar y conectar TODO el Resumen de
// Historia Clínica": Odontograma showed real data (4 piezas con
// hallazgos, actualizado 4 sep 2026 por Alex Test 1) while Resumen's
// "Última actualización del odontograma" card still said "Sin odontograma
// registrado" — the exact same class of bug as the earlier "Última
// atención" fix (a card hardcoded as a literal string, never wired to its
// real source). This audits ALL 8 Resumen cards against
// /dev-qa/patient-record-preview's fixture, not just Odontograma:
//
//   1. Alergias                              → REAL (patient_medical_histories.allergies)
//   2. Medicamentos actuales                 → REAL (patient_medical_histories.current_medications)
//   3. Condiciones médicas relevantes        → REAL (patient_medical_histories.medical_conditions)
//   4. Última atención                       → REAL/DERIVADO (patient_clinical_encounters, already covered by qa-historia-clinica-ultima-atencion-check.mjs)
//   5. Tratamientos activos                  → REAL (public.patient_treatment_plan_items, added by "PROMPT NINJA — Plan de Tratamiento") — full CRUD coverage lives in qa-treatment-plan-check.mjs; this script only re-confirms the card itself renders real active (planned/in_progress) content and never a completed/cancelled item, so a future change to this card can't silently regress it back to a placeholder without failing here too
//   6. Próxima cita                          → REAL/DERIVADO (public.appointments — earliest future non-terminal row)
//   7. Última actualización del odontograma  → REAL/DERIVADO (patient_tooth_findings — THE reported bug)
//   8. Notas clínicas importantes            → REAL (public.patient_clinical_notes, added by "PROMPT NINJA — Notas clínicas importantes") — full CRUD coverage lives in qa-clinical-notes-check.mjs; this script only re-confirms the card itself renders real active content and never an archived note, so a future change to this card can't silently regress it back to a placeholder without failing here too.
//
// See resumen-tab.tsx's own top comment for the full per-card audit
// writeup this script verifies.

import puppeteer from "puppeteer-core";
import { assert, attachConsoleMonitor, ensureDevServer, findChrome, stopDevServer } from "./qa-lib.mjs";

const PATIENT_RECORD_URL = "http://localhost:3000/dev-qa/patient-record-preview";

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-resumen-cards-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-resumen-cards-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    console.log("Scenario: all 8 Resumen cards reflect their real source (or an honest, non-fabricated placeholder)");
    const page = await browser.newPage();
    // fetchTeamMembers (odontogram professional-name resolution) 401s
    // without a real session here — expected, same allowance as every
    // other unauthenticated fixture read in this suite.
    attachConsoleMonitor(page, failures, {
      extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
    });
    await page.goto(PATIENT_RECORD_URL, { waitUntil: "networkidle0", timeout: 30_000 });
    // Give the odontogram card's async professional-name resolution time
    // to settle (it 401s and falls back to date-only) before reading it.
    await new Promise((r) => setTimeout(r, 1500));

    const cardValue = (label) =>
      page.evaluate((lbl) => {
        const cards = Array.from(document.querySelectorAll("div.rounded-xl.border.border-border"));
        const card = cards.find((c) => Array.from(c.querySelectorAll("p")).some((p) => p.textContent.trim() === lbl));
        return card?.querySelectorAll("p")[1]?.textContent.trim() ?? null;
      }, label);

    const alergias = await cardValue("Alergias");
    assert(alergias === "Penicilina", `Alergias reflects real antecedentes (got "${alergias}")`, failures);

    const medicamentos = await cardValue("Medicamentos actuales");
    assert(medicamentos === "Ninguno", `Medicamentos actuales reflects real antecedentes (got "${medicamentos}")`, failures);

    const condiciones = await cardValue("Condiciones médicas relevantes");
    assert(condiciones === "Hipertensión controlada", `Condiciones médicas relevantes reflects real antecedentes (got "${condiciones}")`, failures);

    const ultimaAtencion = await cardValue("Última atención");
    assert(ultimaAtencion !== "Sin atenciones registradas", "Última atención is wired (covered in depth elsewhere)", failures);

    // Same reasoning as the Notas clínicas importantes card below: this is
    // no longer a plain ClinicalInfoCard, so it's read via its own
    // container text rather than the shared cardValue() helper above.
    const tratamientosCardText = await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll("p")).find((p) => p.textContent.trim() === "Tratamientos activos");
      return label?.closest("div.rounded-xl")?.textContent ?? null;
    });
    assert(
      Boolean(tratamientosCardText && tratamientosCardText.includes("Tratamiento de conducto")),
      "Tratamientos activos shows a real active (in_progress) item from the fixture, not a placeholder",
      failures,
    );
    assert(
      Boolean(tratamientosCardText && !tratamientosCardText.includes("ya realizada")),
      "never shows a completed item's content on the card",
      failures,
    );
    assert(
      Boolean(tratamientosCardText && !tratamientosCardText.includes("no continuar")),
      "never shows a cancelled item's content on the card",
      failures,
    );

    const proximaCita = await cardValue("Próxima cita");
    assert(proximaCita !== "Sin cita programada", `Próxima cita reflects the real future appointment, never "Sin cita programada" (got "${proximaCita}")`, failures);
    assert(Boolean(proximaCita && proximaCita.includes("Control de ortodoncia")), `Próxima cita shows the real appointment's own reason (got "${proximaCita}")`, failures);
    assert(Boolean(proximaCita && proximaCita.includes("2026")), `Próxima cita shows a real date (got "${proximaCita}")`, failures);

    const odontograma = await cardValue("Última actualización del odontograma");
    assert(odontograma !== "Sin odontograma registrado", `never "Sin odontograma registrado" once real findings exist — THE reported bug (got "${odontograma}")`, failures);
    assert(Boolean(odontograma && odontograma.includes("4 de sept de 2026")), `shows the MOST RECENT finding's date (2026-09-04), not an older one (got "${odontograma}")`, failures);
    assert(Boolean(odontograma && !odontograma.includes("20 de sept")), `never shows a stale/wrong date from an older finding (got "${odontograma}")`, failures);

    // This card is no longer a plain ClinicalInfoCard (it needs a list +
    // a "Gestionar notas" action, not just a single string `value` — see
    // resumen-tab.tsx's own comment), so it's read via its own container
    // text rather than the shared cardValue() helper above.
    const notasCardText = await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll("p")).find((p) => p.textContent.trim() === "Notas clínicas importantes");
      return label?.closest("div.rounded-xl")?.textContent ?? null;
    });
    assert(
      Boolean(notasCardText && notasCardText.includes("ansiedad dental")),
      "Notas clínicas importantes shows real active note content (fixture's own note), not a placeholder",
      failures,
    );
    assert(
      Boolean(notasCardText && !notasCardText.includes("ya resuelta")),
      "never shows an archived note's content on the card",
      failures,
    );

    await page.close();
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-resumen-cards-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-resumen-cards-check: OK — all 8 Resumen cards reflect their real source or an honest, non-fabricated placeholder.");
}

main().catch((err) => {
  console.error("qa-resumen-cards-check: script error:", err);
  process.exit(2);
});
