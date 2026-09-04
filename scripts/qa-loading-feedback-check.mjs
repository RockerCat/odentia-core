#!/usr/bin/env node
// Browser regression for the transversal "immediate pending feedback"
// pattern audited/fixed across odentia-core's real screens: every
// perceptibly-slow async action must go idle → pending (disabled +
// contextual text, e.g. "Guardando…") → success/error, and — the specific
// bug class this task found repeatedly — a pending flag must never be
// reset before a SUBSEQUENT navigation actually completes, letting a
// business-state value that already changed leak through and show the
// WRONG label (e.g. "Iniciar atención" → "Continuar atención" while still
// mid-navigation, exactly as if the click had been ignored).
//
// Covers the 5 flows explicitly required:
//   1. Iniciar atención → "Iniciando atención…" until navigation
//      completes (already covered in full, with its own red→green
//      history, by qa-start-encounter-transition-check.mjs — not
//      duplicated here).
//   2. Guardar borrador → "Guardando…" (RealClinicalEncounterScreen —
//      already correct before this task; regression added here so it
//      can't silently regress).
//   3. Finalizar atención → "Finalizando…" until navigation completes —
//      THE bug this task found: setFinalizing(false) AND
//      setShowFinalizeConfirm(false) both fired on success right after
//      router.push("/agenda"), which doesn't wait for the transition to
//      finish — the confirm dialog (showing "Finalizando…") closed
//      immediately, dropping the user back on the plain "Finalizar
//      atención" trigger button (which wasn't even gated by `finalizing`)
//      fully enabled, for however long /agenda's own server-side fetch
//      took.
//   4. Crear cita / Reprogramar cita → pending visible (already correct;
//      regression added for completeness).
//   5. Generar PDF (Historia Clínica) → "Generando…" immediately, and a
//      failure restores "Descargar PDF" WITH a visible error — the bug
//      here: handleDownloadPdf had a `finally` but no `catch`, so a
//      failure silently reverted the button with zero indication anything
//      had gone wrong.
//
// Uses two new dev-only fixtures (not the existing /dev-qa/agenda-preview,
// which only covers Agenda's own board/grid):
//   - /dev-qa/clinical-encounter-preview (RealClinicalEncounterScreen)
//   - /dev-qa/patient-record-preview (PatientClinicalRecordScreen, for
//     the PDF scenario)
// Both are "use client" components with no Server→Client boundary
// concern (unlike agenda-preview), and both gate themselves with
// useRouteGuard, whose own sessionOk is unconditionally true in
// development — no real Supabase session or mock-session setup needed.
// Every write these fixtures trigger still hits the real backend and
// fails (401/RLS) unless intercepted — exactly what scenario 3's success
// path needs, so the specific network calls it depends on are mocked the
// same way qa-start-encounter-transition-check.mjs already does for
// "Iniciar atención" (a test-harness technique standing in for a real
// session, not a change to backend behavior).

import puppeteer from "puppeteer-core";
import { assert, attachConsoleMonitor, ensureDevServer, findChrome, stopDevServer } from "./qa-lib.mjs";

const ENCOUNTER_URL = "http://localhost:3000/dev-qa/clinical-encounter-preview";
const PATIENT_RECORD_URL = "http://localhost:3000/dev-qa/patient-record-preview";
const AGENDA_URL = "http://localhost:3000/dev-qa/agenda-preview";

function corsHeaders(extra = {}) {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "*", "access-control-allow-headers": "*", ...extra };
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-loading-feedback-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-loading-feedback-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    // --- Scenario 1: Guardar borrador — immediate pending + restore. -----
    console.log('Scenario: "Guardar borrador" shows immediate pending feedback and restores on failure');
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("failed [object Object]"),
      });
      await page.goto(ENCOUNTER_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Guardar borrador")?.click();
      });
      await new Promise((r) => setTimeout(r, 30));
      const immediate = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Guardando") || b.textContent.trim() === "Guardar borrador");
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(immediate.text === "Guardando…", 'label immediately becomes "Guardando…" on click', failures);
      assert(immediate.disabled === true, "button is disabled immediately (no double-submit)", failures);

      await new Promise((r) => setTimeout(r, 1500));
      const after = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Guardar borrador") || b.textContent.includes("Guardando"));
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(after.text === "Guardar borrador", "label restores after the request settles (fails without a real session)", failures);
      assert(after.disabled === false, "button is re-enabled after settling", failures);
      await page.close();
    }

    // --- Scenario 2: Finalizar atención — the critical fix. --------------
    console.log('Scenario: "Finalizar atención" — confirm dialog shows "Finalizando…" and stays open/disabled through a slowed successful navigation, never reverting to the plain trigger');
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        allowFakeClockHydrationMismatch: false,
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("failed [object Object]"),
      });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (method === "OPTIONS" && (url.includes("/rest/v1/rpc/upsert_patient_clinical_encounter") || url.includes("/rest/v1/appointments"))) {
          req.respond({ status: 204, headers: corsHeaders(), body: "" });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/rpc/upsert_patient_clinical_encounter")) {
          // Stand in for a successful upsert — the RPC's own real return
          // shape (a single encounter row); only lets the client's
          // post-success state machine run in this unauthenticated fixture,
          // the RPC itself is untouched and already verified live
          // elsewhere in this session.
          req.respond({
            status: 200,
            headers: corsHeaders({ "content-type": "application/json" }),
            body: JSON.stringify({ id: "encounter-1", finalized_at: new Date().toISOString() }),
          });
          return;
        }
        if (method === "PATCH" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 204, headers: corsHeaders(), body: "" });
          return;
        }
        if (url.includes("/agenda") && !url.includes("/agenda/atencion") && !url.includes("dev-qa")) {
          // Slow the /agenda navigation down deliberately (test-harness
          // only) so the transitional state has a reliably observable
          // window instead of racing headless Chrome's own timing.
          setTimeout(() => req.continue(), 2000);
          return;
        }
        req.continue();
      });

      await page.goto(ENCOUNTER_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Finalizar atención")?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      const dialogOpened = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Finalizar atención"]')));
      assert(dialogOpened === true, "confirm dialog opened", failures);

      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Finalizar atención"]');
        Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent.trim() === "Finalizar atención")?.click();
      });

      let sawPlainTrigger = false;
      let alwaysShowedFinalizando = true;
      let alwaysDisabled = true;
      let dialogStayedOpen = true;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const state = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"][aria-label="Finalizar atención"]');
          const footerBtn = Array.from(document.querySelectorAll("footer button")).find((b) => (b.textContent.includes("Finalizar") || b.textContent.includes("Finalizando")));
          if (!dialog) return { dialogOpen: false, footerText: footerBtn?.textContent.trim() ?? null, footerDisabled: footerBtn?.disabled ?? null };
          const confirmBtn = Array.from(dialog.querySelectorAll("button")).find((b) => (b.textContent.includes("Finalizar") || b.textContent.includes("Finalizando")));
          return { dialogOpen: true, confirmText: confirmBtn?.textContent.trim(), confirmDisabled: confirmBtn?.disabled };
        });
        if (!state.dialogOpen) {
          // Component unmounted (navigation landed) or dialog closed —
          // either way, stop sampling; if it closed WITHOUT the page
          // having actually navigated away, that's the bug.
          const stillOnEncounterPage = await page.evaluate(() => window.location.pathname.includes("clinical-encounter-preview"));
          if (stillOnEncounterPage) {
            dialogStayedOpen = false;
            if (state.footerText === "Finalizar atención" && state.footerDisabled === false) sawPlainTrigger = true;
          }
          break;
        }
        if (state.confirmText !== "Finalizando…") alwaysShowedFinalizando = false;
        if (state.confirmDisabled !== true) alwaysDisabled = false;
      }

      assert(dialogStayedOpen === true, "confirm dialog never closes before the navigation actually lands", failures);
      assert(sawPlainTrigger === false, 'never falls back to the plain, fully-enabled "Finalizar atención" trigger mid-navigation', failures);
      assert(alwaysShowedFinalizando === true, 'consistently shows "Finalizando…" for as long as the dialog is visible', failures);
      assert(alwaysDisabled === true, "the confirm button stays disabled throughout (no double-submit)", failures);
      await page.close();
    }

    // --- Scenario 3: Finalizar atención — backend failure restores the
    // trigger and shows the error, dialog stays open for a retry. ---------
    console.log('Scenario: "Finalizar atención" backend failure restores the button and shows an error');
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("failed [object Object]"),
      });
      await page.goto(ENCOUNTER_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Finalizar atención")?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Finalizar atención"]');
        Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent.trim() === "Finalizar atención")?.click();
      });
      await new Promise((r) => setTimeout(r, 1500));

      const state = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Finalizar atención"]');
        if (!dialog) return { dialogOpen: false };
        const confirmBtn = Array.from(dialog.querySelectorAll("button")).find((b) => (b.textContent.includes("Finalizar") || b.textContent.includes("Finalizando")));
        const errorEl = dialog.querySelector(".text-danger");
        return { dialogOpen: true, confirmText: confirmBtn?.textContent.trim(), confirmDisabled: confirmBtn?.disabled, error: errorEl?.textContent.trim() ?? null };
      });
      assert(state.dialogOpen === true, "dialog stays open after a failure (so the user can retry)", failures);
      assert(state.confirmText === "Finalizar atención", 'label is restored to "Finalizar atención" after a failure', failures);
      assert(state.confirmDisabled === false, "confirm button is re-enabled after a failure", failures);
      assert(Boolean(state.error), "an error message is shown after a failure", failures);
      await page.close();
    }

    // --- Scenario 4: Crear cita — pending visible (already correct;
    // regression kept here for completeness). -----------------------------
    console.log('Scenario: "Crear cita" shows immediate pending feedback');
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40"),
      });
      await page.goto(AGENDA_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim().includes("Nueva cita"))?.click();
      });
      await new Promise((r) => setTimeout(r, 400));

      // Fill patient + professional so canCreate is satisfiable, then pick
      // a future day/time and click Crear cita.
      await page.evaluate(() => {
        document.querySelector('[role="dialog"][aria-label="Nueva cita"] input[placeholder="Buscar paciente…"]')?.focus();
      });
      await new Promise((r) => setTimeout(r, 200));
      await page.evaluate(() => document.querySelector('[role="dialog"] li button')?.click());
      await new Promise((r) => setTimeout(r, 200));
      const hasProf = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Nueva cita"] input[placeholder="Buscar profesional…"]')));
      if (hasProf) {
        await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Nueva cita"] input[placeholder="Buscar profesional…"]')?.focus());
        await new Promise((r) => setTimeout(r, 200));
        await page.evaluate(() => document.querySelector('[role="dialog"] li button')?.click());
        await new Promise((r) => setTimeout(r, 200));
      }
      await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Nueva cita"] button[aria-label="Editar Fecha"]')?.click());
      await new Promise((r) => setTimeout(r, 300));
      const tomorrow = await page.evaluate(() => new Date(Date.now() + 86400000).getDate());
      await page.evaluate((num) => {
        const btn = Array.from(document.querySelectorAll(".grid.grid-cols-4 button")).find((b) => b.querySelector("span:last-child")?.textContent.trim() === String(num));
        btn?.click();
      }, tomorrow);
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Nueva cita"] button[aria-label="Editar Horario"]')?.click());
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate(() => {
        const select = document.getElementById("time-popover-start");
        select.value = "10:00 AM";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Guardar")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"][aria-label="Nueva cita"] button')).find((b) => b.textContent.includes("Crear cita"))?.click();
      });
      await new Promise((r) => setTimeout(r, 30));
      const immediate = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Nueva cita"]');
        const btn = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent.includes("Creando") || b.textContent.includes("Crear cita"));
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(immediate.text === "Creando…", 'label immediately becomes "Creando…" on click', failures);
      assert(immediate.disabled === true, "button is disabled immediately (no double-submit)", failures);
      await page.close();
    }

    // --- Scenario 5: Generar PDF — immediate pending + error recovery. ---
    console.log('Scenario: "Descargar PDF" shows immediate pending feedback and restores with a visible error on failure');
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.goto(PATIENT_RECORD_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Descargar PDF"))?.click();
      });
      await new Promise((r) => setTimeout(r, 30));
      const immediate = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Generando") || b.textContent.includes("Descargar PDF"));
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(immediate.text === "Generando…", 'label immediately becomes "Generando…" on click', failures);
      assert(immediate.disabled === true, "button is disabled immediately (no double-submit)", failures);

      await new Promise((r) => setTimeout(r, 2000));
      const after = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Descargar PDF") || b.textContent.includes("Generando"));
        const errorEl = document.querySelector(".text-danger");
        return { text: btn?.textContent.trim(), disabled: btn?.disabled, error: errorEl?.textContent.trim() ?? null };
      });
      assert(after.text === "Descargar PDF", "label restores after a failure (fails without a real session)", failures);
      assert(after.disabled === false, "button is re-enabled after a failure", failures);
      assert(Boolean(after.error), "a visible error message appears — this used to fail completely silently", failures);
      await page.close();
    }
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-loading-feedback-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-loading-feedback-check: OK — every audited async action gives immediate, non-misleading pending feedback.");
}

main().catch((err) => {
  console.error("qa-loading-feedback-check: script error:", err);
  process.exit(2);
});
