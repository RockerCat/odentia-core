#!/usr/bin/env node
// Browser regression for canStartClinicalEncounter (src/features/dashboard/
// real-status.ts) — the single central rule for when "Iniciar/Continuar
// atención" is allowed, reused as-is by RealAppointmentDetailModal's
// primary CTA and the real /agenda/atencion/[appointmentId] route's own
// server-side guard.
//
// Before this rule existed, RealAppointmentDetailModal's CTA only checked
// role/professional-profile and non-terminal status — a scheduled/
// confirmed Cita hours or days in the future already showed "Iniciar
// atención" as soon as its detail was opened, and the server route would
// have happily flipped it to `in_progress` on a direct visit. This script
// exercises the actual UI (not just the pure helper, which has its own
// exhaustive table-driven coverage in real-status.test.ts) against a
// synthetic `confirmed` appointment added to the /dev-qa/agenda-preview
// fixture specifically for this (fixtures.ts's FUTURE_CONFIRMED_APPOINTMENT_ID
// — none of the fixture's original rows were non-terminal and non-
// in_progress, so there was nothing to exercise the 30-minute window
// against).
//
// The server-side route guard itself (the other reuse site) can't be
// exercised from this unauthenticated fixture — direct-navigating there
// requires a real Supabase session this fixture deliberately has none of
// (see qa-no-past-appointments-check.mjs's own note on the same
// limitation for backend writes). It's covered instead by: (a) reading
// the route's own source, which calls the exact same
// canStartClinicalEncounter import before ever writing `in_progress`, and
// (b) real-status.test.ts's unit coverage of that shared function.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const URL = "http://localhost:3000/dev-qa/agenda-preview";
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  process.env.CHROME_PATH,
].filter(Boolean);

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status < 500) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function assert(condition, label, failures) {
  if (condition) {
    console.log(`  ok — ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL — ${label}`);
  }
}

// Pins Date to an absolute fixed instant for every script on this page
// from here on (survives navigation) — deterministic regardless of when
// this script actually runs.
async function installFakeClockAt(page, isoInstant) {
  await page.evaluateOnNewDocument(
    (iso) => {
      const RealDate = Date;
      const FIXED = new RealDate(iso).getTime();
      class FakeDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) super(FIXED);
          else super(...args);
        }
        static now() {
          return FIXED;
        }
      }
      window.Date = FakeDate;
    },
    isoInstant,
  );
}

async function openDetailModalForSlotContaining(page, text) {
  const clicked = await page.evaluate((t) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find((b) => b.textContent.includes(t) && !b.closest('[role="dialog"]'));
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
  await new Promise((r) => setTimeout(r, 400));
  return clicked;
}

async function navigateDayStripTo(page, dayNum) {
  const clicked = await page.evaluate((num) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find(
      (b) => { const m = /^[A-Za-zÁÉÍÓÚáéíóú]{3}(\d{1,2})$/.exec(b.textContent.trim()); return m && Number(m[1]) === num && !b.closest(".grid-cols-4"); },
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, dayNum);
  await new Promise((r) => setTimeout(r, 400));
  return clicked;
}

async function primaryCtaState(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Cita de Laura Diaz"]');
    if (!dialog) return { dialogOpen: false };
    const buttons = Array.from(dialog.querySelectorAll("button"));
    const iniciar = buttons.find((b) => b.textContent.includes("Iniciar atención"));
    const continuar = buttons.find((b) => b.textContent.includes("Continuar atención"));
    return {
      dialogOpen: true,
      hasIniciar: Boolean(iniciar),
      iniciarDisabled: iniciar?.disabled ?? null,
      hasContinuar: Boolean(continuar),
    };
  });
}

async function closeDialog(page) {
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Cita de Laura Diaz"]');
    dialog?.querySelector('button[aria-label="Cerrar"]')?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
}

async function main() {
  const chromePath = CHROME_CANDIDATES.find((p) => {
    try {
      return existsSync(p);
    } catch {
      return false;
    }
  });
  if (!chromePath) {
    console.error("qa-can-start-encounter-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  const alreadyUp = await waitForServer("http://localhost:3000", 1000);
  if (!alreadyUp) {
    devServer = spawn("npm", ["run", "dev"], { stdio: "ignore", detached: true });
    startedServer = true;
    const up = await waitForServer("http://localhost:3000", 60_000);
    if (!up) {
      console.error("qa-can-start-encounter-check: dev server never became ready.");
      if (devServer.pid) process.kill(-devServer.pid);
      process.exit(2);
    }
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    // --- Scenario 1: 31 minutes before the confirmed Cita's startsAt
    // (2026-09-05T13:00:00Z, 8:00 AM local) — "Iniciar atención" must not
    // be offered at all. ---------------------------------------------------
    console.log("Scenario: confirmed Cita, 7:29 AM local (31 min before an 8:00 AM startsAt)");
    {
      const page = await browser.newPage();
      await installFakeClockAt(page, "2026-09-05T12:29:00.000Z");
      await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));
      await navigateDayStripTo(page, 5);
      await openDetailModalForSlotContaining(page, "8:00 AM");
      const state = await primaryCtaState(page);
      assert(state.dialogOpen === true, "detail modal opened", failures);
      assert(state.hasIniciar === false, "Iniciar atención is NOT offered 31 minutes before startsAt", failures);
      await page.close();
    }

    // --- Scenario 2: exactly 30 minutes before — the window's own
    // boundary, "Iniciar atención" must be offered and enabled. ------------
    console.log("Scenario: confirmed Cita, 7:30 AM local (exactly 30 min before startsAt)");
    {
      const page = await browser.newPage();
      await installFakeClockAt(page, "2026-09-05T12:30:00.000Z");
      await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));
      await navigateDayStripTo(page, 5);
      await openDetailModalForSlotContaining(page, "8:00 AM");
      const state = await primaryCtaState(page);
      assert(state.hasIniciar === true, "Iniciar atención IS offered exactly 30 minutes before startsAt", failures);
      assert(state.iniciarDisabled === false, "Iniciar atención is enabled (not disabled) at the boundary", failures);
      await closeDialog(page);
      await page.close();
    }

    // --- Scenario 3: well after startsAt, still non-terminal ("Sin
    // cerrar" territory) — still offered. -----------------------------------
    console.log("Scenario: confirmed Cita, 2 hours after its own startsAt (never started, non-terminal)");
    {
      const page = await browser.newPage();
      await installFakeClockAt(page, "2026-09-05T15:00:00.000Z"); // 10:00 AM local, 2h after 8:00 AM
      await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));
      await navigateDayStripTo(page, 5);
      await openDetailModalForSlotContaining(page, "8:00 AM");
      const state = await primaryCtaState(page);
      assert(state.hasIniciar === true, "Iniciar atención still offered well after startsAt while non-terminal", failures);
      await closeDialog(page);
      await page.close();
    }

    // --- Scenario 4: viewed from a different calendar day entirely (a
    // date change) — the appointment is on Sep 5, "now" is Sep 3, deep
    // outside the window regardless of local clock time. -------------------
    console.log("Scenario: confirmed Cita for Sep 5, viewed with \"now\" fixed on Sep 3 (a date change)");
    {
      const page = await browser.newPage();
      await installFakeClockAt(page, "2026-09-03T13:00:00.000Z"); // same clock TIME, two days earlier
      await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));
      await navigateDayStripTo(page, 5);
      await openDetailModalForSlotContaining(page, "8:00 AM");
      const state = await primaryCtaState(page);
      assert(state.hasIniciar === false, "Iniciar atención is NOT offered when viewed two days before its own date", failures);
      await page.close();
    }

    // --- Scenario 5: an in_progress fixture appointment always offers
    // "Continuar atención", regardless of the clock. -----------------------
    console.log('Scenario: in_progress Cita always offers "Continuar atención"');
    {
      const page = await browser.newPage();
      await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));
      // Fixture's in_progress rows are all on Sep 1 (see fixtures.ts) —
      // outside the current week strip's default view isn't an issue since
      // the board only ever shows the current real week; Sep 1 falls
      // inside it (see prior tasks' captured weekOffsetIso).
      await navigateDayStripTo(page, 1);
      await openDetailModalForSlotContaining(page, "12:30 PM"); // 17:30 UTC == 12:30 PM local
      const state = await primaryCtaState(page);
      assert(state.dialogOpen === true, "in_progress appointment's detail modal opened", failures);
      assert(state.hasContinuar === true, "Continuar atención is offered for an in_progress Cita", failures);
      assert(state.hasIniciar === false, "the button never reads \"Iniciar atención\" once in_progress", failures);
      await closeDialog(page);
      await page.close();
    }

    // --- Scenario 6: a terminal fixture appointment offers neither. -------
    console.log("Scenario: a terminal (completed) Cita offers neither Iniciar nor Continuar");
    {
      const page = await browser.newPage();
      await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));
      await navigateDayStripTo(page, 1);
      await openDetailModalForSlotContaining(page, "5:30 PM"); // 22:30 UTC completed row
      const state = await primaryCtaState(page);
      assert(state.dialogOpen === true, "terminal appointment's detail modal opened", failures);
      assert(state.hasIniciar === false && state.hasContinuar === false, "neither Iniciar nor Continuar atención is offered for a terminal Cita", failures);
      await closeDialog(page);
      await page.close();
    }
  } finally {
    await browser.close();
    if (startedServer && devServer && devServer.pid) {
      process.kill(-devServer.pid);
    }
  }

  if (failures.length > 0) {
    console.error(`\nqa-can-start-encounter-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-can-start-encounter-check: OK — canStartClinicalEncounter's rule holds in RealAppointmentDetailModal.");
}

main().catch((err) => {
  console.error("qa-can-start-encounter-check: script error:", err);
  process.exit(2);
});
