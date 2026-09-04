#!/usr/bin/env node
// Browser regression for the "Iniciar atención" transition UX bug: on
// click, RealAppointmentDetailModal used to reset startingEncounter back
// to false in a `finally` block right after calling router.push() — but
// router.push() only STARTS a client-side transition, it doesn't return a
// Promise that resolves when the transition finishes. Since
// onUpdated({ ..., status: "in_progress" }) had already run by then,
// appointment.status was already "in_progress", and with
// startingEncounter back to false, primaryCtaLabel's own fallback
// (isInProgress ? "Continuar atención" : "Iniciar atención") showed
// "Continuar atención" for however long /agenda/atencion/[id]'s own
// server-side data fetching took — looking exactly like the click hadn't
// registered and the user needed to click again.
//
// Fixed by only resetting startingEncounter on failure — on success the
// component is about to unmount once the route change lands, so nothing
// needs to reset it — and by tracking whether THIS click was a fresh
// start or an already-in_progress "continue" (startedFresh state), since
// by the time the transitional label renders, isInProgress has already
// flipped to true either way and can no longer tell the two apart.
//
// This fixture has no real Supabase session, so updateAppointment would
// otherwise always fail (401) before ever reaching the interesting
// transitional state. Network interception here stands in for the
// backend response ONLY to let the client's OWN state machine run its
// real course — nothing about backend behavior is being asserted or
// changed (see appointments-actions.ts, untouched by this task). The
// /agenda/atencion/[id] navigation is deliberately slowed by the same
// interception (a test-harness technique, not a product delay — CLAUDE.md
// "no artificial delays" applies to the app itself, not to making an
// otherwise-instant race observable in a test) so the transient state has
// a reliably observable window instead of racing a headless browser's own
// timing.

import puppeteer from "puppeteer-core";
import { allow401, assert, attachConsoleMonitor, ensureDevServer, findChrome, installFakeClock, navigateDayStripTo, stopDevServer } from "./qa-lib.mjs";

const URL = "http://localhost:3000/dev-qa/agenda-preview";

async function primaryCtaState(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label^="Cita de"]');
    if (!dialog) return { dialogOpen: false };
    const buttons = Array.from(dialog.querySelectorAll("button"));
    const primary = buttons.find((b) => b.className.includes("bg-primary") && !b.closest('[role="menu"]'));
    return {
      dialogOpen: true,
      label: primary ? primary.textContent.trim() : null,
      disabled: primary ? primary.disabled : null,
      bodyHasContinuar: dialog.innerText.includes("Continuar atención"),
      bodyHasIniciarAtencion: dialog.innerText.includes("Iniciando atención"),
    };
  });
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-start-encounter-transition-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-start-encounter-transition-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    // --- Scenario 1: fresh "Iniciar atención" — the exact reported bug. ---
    console.log('Scenario: click "Iniciar atención" — label immediately becomes "Iniciando atención…", stays disabled, never shows "Continuar atención" during the transition');
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, { allowFakeClockHydrationMismatch: true, extraAllowed: allow401 });
      await installFakeClock(page, 8, 2); // matches TODAY_EIGHT_AM_APPOINTMENT_ID's own startable window
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        if (req.method() === "PATCH" && url.includes("/rest/v1/appointments")) {
          // Stand in for a successful updateAppointment PATCH (PostgREST's
          // own real response shape for an update with no .select()) —
          // the backend itself is untouched; this only lets the client's
          // post-success state machine actually run in this unauthenticated
          // fixture.
          req.respond({
            status: 204,
            headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
            body: "",
          });
          return;
        }
        if (req.method() === "OPTIONS" && url.includes("/rest/v1/appointments")) {
          // The browser's own CORS preflight ahead of the PATCH above —
          // needs a matching mocked response too, or the fetch never even
          // reaches the point of sending the real request.
          req.respond({
            status: 204,
            headers: {
              "access-control-allow-origin": "*",
              "access-control-allow-methods": "PATCH, OPTIONS",
              "access-control-allow-headers": "*",
            },
            body: "",
          });
          return;
        }
        if (url.includes("/agenda/atencion/")) {
          // Slow the navigation down deliberately (test-harness only) so
          // the transitional state has a reliably observable window.
          setTimeout(() => req.continue(), 2000);
          return;
        }
        req.continue();
      });

      await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      const opened = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const btn = buttons.find((b) => b.textContent.includes("8:00 AM") && b.textContent.includes("Laura") && !b.closest('[role="dialog"]'));
        if (!btn) return false;
        btn.click();
        return true;
      });
      await new Promise((r) => setTimeout(r, 500));

      const before = await primaryCtaState(page);
      assert(opened && before.dialogOpen === true, "detail modal opened for the confirmed 8:00 AM Cita", failures);
      assert(before.label === "Iniciar atención", 'starts out showing "Iniciar atención"', failures);

      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label^="Cita de"]');
        const buttons = Array.from(dialog.querySelectorAll("button"));
        buttons.find((b) => b.className.includes("bg-primary"))?.click();
      });

      // Sample the button state repeatedly across the whole (deliberately
      // slowed) transition window — must NEVER read "Continuar atención"
      // and must consistently show the loading label, disabled.
      let sawContinuar = false;
      let alwaysShowedIniciando = true;
      let alwaysDisabled = true;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const state = await primaryCtaState(page);
        if (!state.dialogOpen) break; // navigated away/unmounted — success
        if (state.bodyHasContinuar) sawContinuar = true;
        if (state.label !== "Iniciando atención…") alwaysShowedIniciando = false;
        if (state.disabled !== true) alwaysDisabled = false;
      }

      assert(sawContinuar === false, 'never shows "Continuar atención" at any point during the transition', failures);
      assert(alwaysShowedIniciando === true, 'consistently shows "Iniciando atención…" throughout the transition', failures);
      assert(alwaysDisabled === true, "the CTA stays disabled throughout the transition (no double-submit)", failures);

      await page.close();
    }

    // --- Scenario 2: backend failure restores "Iniciar atención". --------
    console.log('Scenario: backend failure restores "Iniciar atención" and shows the error');
    {
      const page = await browser.newPage();
      // extraAllowed also covers this scenario's own deliberately-mocked
      // 500 (proving the failure path) — a real bug would surface as a
      // DIFFERENT unexpected message, not this exact one this test itself
      // injects.
      attachConsoleMonitor(page, failures, {
        allowFakeClockHydrationMismatch: true,
        extraAllowed: (text) => allow401(text) || text.includes("the server responded with a status of 500"),
      });
      await installFakeClock(page, 8, 2);
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        if (req.method() === "PATCH" && url.includes("/rest/v1/appointments")) {
          req.respond({
            status: 500,
            headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
            body: JSON.stringify({ message: "simulated failure", code: "XXTEST" }),
          });
          return;
        }
        if (req.method() === "OPTIONS" && url.includes("/rest/v1/appointments")) {
          req.respond({
            status: 204,
            headers: {
              "access-control-allow-origin": "*",
              "access-control-allow-methods": "PATCH, OPTIONS",
              "access-control-allow-headers": "*",
            },
            body: "",
          });
          return;
        }
        req.continue();
      });

      await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        buttons.find((b) => b.textContent.includes("8:00 AM") && b.textContent.includes("Laura") && !b.closest('[role="dialog"]'))?.click();
      });
      await new Promise((r) => setTimeout(r, 500));
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label^="Cita de"]');
        const buttons = Array.from(dialog.querySelectorAll("button"));
        buttons.find((b) => b.className.includes("bg-primary"))?.click();
      });
      await new Promise((r) => setTimeout(r, 800));

      const afterFailure = await primaryCtaState(page);
      const errorShown = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label^="Cita de"]');
        return dialog.innerText.includes("No pudimos guardar el cambio") || dialog.innerText.toLowerCase().includes("no pudimos");
      });
      assert(afterFailure.label === "Iniciar atención", 'label is restored to "Iniciar atención" after a backend failure', failures);
      assert(afterFailure.disabled === false, "the CTA is re-enabled after a backend failure", failures);
      assert(errorShown === true, "an error message is shown after a backend failure", failures);

      await page.close();
    }

    // --- Scenario 3: an already-in_progress Cita keeps showing "Continuar
    // atención" throughout its own click-to-navigate transition too. -------
    console.log('Scenario: an already-in_progress Cita keeps showing "Continuar atención" (never "Iniciando atención…") through its own transition');
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, { extraAllowed: allow401 });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        if (url.includes("/agenda/atencion/")) {
          setTimeout(() => req.continue(), 1500);
          return;
        }
        req.continue();
      });

      await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));
      await navigateDayStripTo(page, 1); // fixture's in_progress rows are on Sep 1
      await new Promise((r) => setTimeout(r, 400));

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        buttons.find((b) => b.textContent.includes("12:30 PM") && !b.closest('[role="dialog"]'))?.click();
      });
      await new Promise((r) => setTimeout(r, 500));

      const before = await primaryCtaState(page);
      assert(before.dialogOpen === true, "in_progress appointment's detail modal opened", failures);
      assert(before.label === "Continuar atención", 'starts out showing "Continuar atención" (never having flipped from Iniciar)', failures);

      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label^="Cita de"]');
        const buttons = Array.from(dialog.querySelectorAll("button"));
        buttons.find((b) => b.className.includes("bg-primary"))?.click();
      });

      let sawIniciando = false;
      let alwaysContinuar = true;
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const state = await primaryCtaState(page);
        if (!state.dialogOpen) break;
        if (state.bodyHasIniciarAtencion) sawIniciando = true;
        if (state.label !== "Continuar atención") alwaysContinuar = false;
      }
      assert(sawIniciando === false, 'never shows "Iniciando atención…" for a Cita that was already in_progress', failures);
      assert(alwaysContinuar === true, 'consistently shows "Continuar atención" throughout its own transition', failures);

      await page.close();
    }
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-start-encounter-transition-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-start-encounter-transition-check: OK — the Iniciar/Continuar atención transition never flickers back to the wrong label.");
}

main().catch((err) => {
  console.error("qa-start-encounter-transition-check: script error:", err);
  process.exit(2);
});
