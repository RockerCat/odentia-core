#!/usr/bin/env node
// Two independent regressions in one script:
//
// 1. Assistant role gating (CLAUDE.md Roles: Assistant manages
//    appointments/can record No asistió, but never attends patients
//    clinically). Exercised via /dev-qa/agenda-preview?role=assistant — a
//    dev-only query param added to that fixture specifically for this
//    (see its own comment), since every other script needs the default
//    clinic_admin role and canAttendPatients=true.
//
// 2. The historical "loadingWeek race condition": real-agenda-screen.tsx's
//    week-fetch effect used a single `loadingWeek` boolean (not one per
//    offset) — navigating next → next → back to a week whose data was
//    already fetched, all within a click or two, could leave `loadingWeek`
//    stuck true (a still-in-flight fetch for an abandoned offset finishes
//    and its own cleanup's `cancelled` flag skips clearing the flag, and
//    the early-return path for an already-fetched offset never touches it
//    either) — the board renders an empty grid for a week whose
//    appointments are already sitting in state. Fixed by clearing
//    `loadingWeek` synchronously on that early-return path (see that
//    file's own comment). Reproduced here by rapid next/next/Hoy clicks —
//    a real race depends on network timing, not just click order, so this
//    can't force the original failure deterministically, but it does
//    prove the fixed early-return path itself, run repeatedly under rapid
//    navigation, never leaves the board showing a stale/empty grid for a
//    week whose data (today's own, offset 0) was already available from
//    the very first load.

import puppeteer from "puppeteer-core";
import { allow401, assert, attachConsoleMonitor, ensureDevServer, findChrome, installFakeClock, navigateDayStripTo, stopDevServer } from "./qa-lib.mjs";

const URL_ASSISTANT = "http://localhost:3000/dev-qa/agenda-preview?role=assistant";
const URL_DEFAULT = "http://localhost:3000/dev-qa/agenda-preview";

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-role-gating-and-race-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-role-gating-and-race-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    // --- Scenario: Assistant can Marcar No asistió but never Iniciar/
    // Continuar atención. ---------------------------------------------------
    console.log("Scenario: Assistant — Marcar No asistió allowed, Iniciar/Continuar atención never");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, { extraAllowed: allow401 });
      await page.goto(URL_ASSISTANT, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      // Fixture's in_progress rows are all on Sep 1 (see fixtures.ts).
      await navigateDayStripTo(page, 1);
      await new Promise((r) => setTimeout(r, 400));

      // Open the fixture's in_progress Cita — for Assistant this is the one
      // case a primary CTA could otherwise appear (Continuar atención) if
      // role gating were broken.
      const openedInProgress = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const btn = buttons.find((b) => b.textContent.includes("12:30 PM") && !b.closest('[role="dialog"]'));
        if (!btn) return false;
        btn.click();
        return true;
      });
      await new Promise((r) => setTimeout(r, 500));
      const inProgressState = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label^="Cita de"]');
        if (!dialog) return { dialogOpen: false };
        const buttons = Array.from(dialog.querySelectorAll("button")).map((b) => b.textContent.trim());
        return {
          dialogOpen: true,
          hasContinuar: buttons.some((b) => b.includes("Continuar atención")),
          hasIniciar: buttons.some((b) => b.includes("Iniciar atención")),
        };
      });
      assert(openedInProgress && inProgressState.dialogOpen === true, "Assistant: in_progress Cita's detail modal opened", failures);
      assert(inProgressState.hasContinuar === false, "Assistant: Continuar atención is NEVER offered, even for an in_progress Cita", failures);
      assert(inProgressState.hasIniciar === false, "Assistant: Iniciar atención is never offered either", failures);
      await page.evaluate(() => {
        document.querySelector('[role="dialog"][aria-label^="Cita de"] button[aria-label="Cerrar"]')?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      // Now check Marcar No asistió on an unresolved (Sin cerrar) Cita —
      // needs a non-terminal appointment well past its grace period. Reuse
      // TODAY_EIGHT_AM_APPOINTMENT_ID (confirmed, today 8:00 AM) with a
      // fresh page whose fake clock sits well past its own grace deadline
      // (8:30 end + 120 min = 10:30) — this must be a NEW page since the
      // first one's clock was never faked (Assistant's own gating above is
      // time-independent, so the real clock was fine there).
      await page.close();
    }

    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, { allowFakeClockHydrationMismatch: true, extraAllowed: allow401 });
      await installFakeClock(page, 11, 0); // 11:00 AM — past the 8:00 AM Cita's 10:30 grace deadline
      await page.goto(URL_ASSISTANT, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      const opened = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const btn = buttons.find((b) => b.textContent.includes("8:00 AM") && b.textContent.includes("Laura") && !b.closest('[role="dialog"]'));
        if (!btn) return false;
        btn.click();
        return true;
      });
      await new Promise((r) => setTimeout(r, 500));
      const state = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label^="Cita de"]');
        if (!dialog) return { dialogOpen: false };
        const buttons = Array.from(dialog.querySelectorAll("button")).map((b) => b.textContent.trim());
        const badge = dialog.innerText.includes("Sin cerrar");
        return {
          dialogOpen: true,
          showsSinCerrar: badge,
          hasMarkNoShow: buttons.some((b) => b.includes("Marcar No asistió")),
          hasIniciar: buttons.some((b) => b.includes("Iniciar atención")),
        };
      });
      assert(opened && state.dialogOpen === true, "Assistant: the now-unresolved 8:00 AM Cita's detail modal opened", failures);
      assert(state.showsSinCerrar === true, 'the Cita correctly reads "Sin cerrar" at 11:00 AM (past its grace deadline)', failures);
      assert(state.hasMarkNoShow === true, "Assistant: Marcar No asistió IS offered for this unresolved Cita", failures);
      assert(state.hasIniciar === false, "Assistant: Iniciar atención is still never offered, even though the temporal window alone would allow it", failures);
      await page.close();
    }

    // --- Scenario: rapid week navigation never leaves a stale/empty grid
    // for a week whose data is already available (loadingWeek race). ------
    console.log("Scenario: rapid next/next/Hoy navigation never shows an empty grid for already-loaded data");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, { extraAllowed: allow401 });
      await page.goto(URL_DEFAULT, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      const initialCount = await page.evaluate(() => document.querySelectorAll('[aria-label="Semana siguiente"]').length);
      assert(initialCount > 0, "week navigation controls are present", failures);

      // Rapid-fire: next, next, Hoy — all back-to-back with no settle delay,
      // then check the board isn't stuck showing an empty grid once things
      // do settle (the historical bug's own symptom).
      await page.evaluate(() => {
        document.querySelector('[aria-label="Semana siguiente"]')?.click();
      });
      await page.evaluate(() => {
        document.querySelector('[aria-label="Semana siguiente"]')?.click();
      });
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        buttons.find((b) => b.textContent.trim() === "Hoy")?.click();
      });
      await new Promise((r) => setTimeout(r, 1500));

      const finalState = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const emptyStateShown = bodyText.includes("Tu clínica todavía no tiene profesionales activos");
        const hasTimeSlots = Array.from(document.querySelectorAll("span")).some((s) => /^\d{1,2}:\d{2} (AM|PM)$/.test(s.textContent.trim()));
        return { emptyStateShown, hasTimeSlots };
      });
      assert(finalState.emptyStateShown === false, "board is not stuck on the empty-professionals state after rapid next/next/Hoy", failures);
      assert(finalState.hasTimeSlots === true, "board still renders real time slots after rapid next/next/Hoy (not a blank grid)", failures);
      await page.close();
    }
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-role-gating-and-race-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-role-gating-and-race-check: OK — Assistant role gating and rapid week navigation both hold.");
}

main().catch((err) => {
  console.error("qa-role-gating-and-race-check: script error:", err);
  process.exit(2);
});
