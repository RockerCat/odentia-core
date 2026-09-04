#!/usr/bin/env node
// Browser regression for the exact reported case: "Cita hoy 8:00–8:30 AM,
// confirmed, viewed at 8:02 AM" showing no "Iniciar atención" and a status
// inconsistency (modal header "Completada" vs. a separate fetch elsewhere
// reading "Confirmada" for what looked like the same Cita).
//
// Root cause: nothing in createAppointment/updateAppointment (appointments-
// actions.ts) ever prevented two Citas from landing on the exact same
// professional+startsAt slot, and the Agenda grid's slot lookup
// (real-appointments-board.tsx) picked whichever row happened to come
// first in fetch/insertion order with no regard for status. A stale
// `completed` row occupying the same slot as a real `confirmed` Cita made
// the live one unreachable by clicking that cell — the grid, and its
// detail modal, showed the WRONG appointment's data entirely (not a
// display bug on the right appointment: a different appointment
// altogether), which is what canStartClinicalEncounter correctly refusing
// "Iniciar atención" for a `completed` Cita, and the header showing
// "Completada", actually reflected — genuinely correct behavior for the
// WRONG Cita.
//
// This exact collision reproduces "for free" here: fixtures.ts's
// "9b853921..." row is hardcoded at a fixed calendar date/time
// (2026-09-04T13:00:00Z, 8:00 AM local) that was "a few days in the
// future" when originally captured and has since silently become
// whatever day the real clock reaches — it happened to land on "today at
// 8 AM" the same day this exact bug was reported, colliding with
// TODAY_EIGHT_AM_APPOINTMENT_ID (added specifically for this check, an
// intentionally identical slot: same professional, same day-relative-to-
// "now" 8:00 AM). No fake collision needed to be constructed — the fixture
// already had a real one once the calendar caught up to it, which is
// itself a small cautionary tale about hardcoded absolute-date fixtures
// (see fixtures.ts's own comment).
//
// Fixed in two places:
//   - appointments-actions.ts: hasOverlappingAppointment, called from both
//     createAppointment and updateAppointment, rejects a create/reschedule
//     that would land on an existing non-terminal Cita's slot for the same
//     professional (OVERLAP_ERROR) — the actual prevention, so this class
//     of collision can't be created going forward. Can't be exercised from
//     this unauthenticated fixture (every write here 401s regardless);
//     covered instead by direct code inspection.
//   - real-status.ts: pickSlotAppointment (used by
//     real-appointments-board.tsx's per-slot lookup) prefers a non-terminal
//     candidate over a terminal one when a slot already has more than one
//     row — a defensive fallback for collisions that predate the fix
//     above, so an old `completed` test row can never again hide a live
//     Cita from the normal click path.
//
// A LATER audit ("PROMPT NINJA — Dejar test:browser completamente verde")
// found this file's own grid-cell-style assertion flaky, NOT the
// production code: instrumenting pickSlotAppointment/isUnresolved/
// getDisplayStatus directly proved they always compute "confirmed"
// correctly for the live Cita, on every render, using the patched fake
// clock. The FIRST-PAINT DOM className can still read as the SSR pass's
// value regardless — this is the exact same category of artifact
// qa-lib.mjs's own top comment already documents for isPastSlot-driven
// disabled/aria-disabled attributes (a fake clock only ever reaches the
// BROWSER; the separate Next.js dev server process still renders the
// initial HTML with the REAL system clock), just manifesting on a
// different attribute (className) here: React logs the one expected
// hydration-mismatch warning (already allowlisted below via
// allowFakeClockHydrationMismatch) but doesn't rewrite this DOM node's
// className during that pass, and a subsequent render that recomputes the
// SAME (correct) value is diffed as "unchanged" and skipped too — so the
// stale SSR value can persist indefinitely once the real clock drifts
// past the confirmed Cita's own grace-period deadline, purely a function
// of what time of day this script happens to run. A real user never hits
// this: their browser and server always share one real clock, so SSR and
// hydration always compute the identical value from the first paint.
// Fixed here (test-only): before reading the cell's classList, the
// Estado filter is toggled to "Completada" and back — two REAL, distinct
// values, guaranteed to force actual DOM writes through the exact same
// production code path (pickSlotAppointment → getDisplayStatus →
// getStatusStyle) a genuine user's own subsequent interaction (any
// filter/day/professional change) would always trigger anyway, well
// before ever clicking into the cell. No production code changed.

import puppeteer from "puppeteer-core";
import { allow401, assert, attachConsoleMonitor, ensureDevServer, findChrome, installFakeClock, stopDevServer } from "./qa-lib.mjs";

const URL = "http://localhost:3000/dev-qa/agenda-preview";

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-slot-collision-status-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-slot-collision-status-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    console.log("Scenario: today's 8:00 AM Cita (confirmed), viewed at 8:02 AM, collides with a stale completed row in the same slot");
    const page = await browser.newPage();
    attachConsoleMonitor(page, failures, { allowFakeClockHydrationMismatch: true, extraAllowed: allow401 });
    await installFakeClock(page, 8, 2);
    await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1000));

    const now = await page.evaluate(() => new Date().toString());
    console.log(`  (fake now: ${now})`);

    const matchCount = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.filter((b) => b.textContent.includes("8:00 AM") && b.textContent.includes("Laura") && !b.closest('[role="dialog"]')).length;
    });
    assert(matchCount === 1, `the collision collapses to exactly one visible 8:00 AM cell, never two overlapping ones (found ${matchCount})`, failures);

    // The grid cell's own visual style is checked via a forced re-render,
    // not the untouched first-paint DOM — see this file's own comment
    // below on why. Filtering to "Completada" first (a genuinely
    // different className than whatever first-paint produced) primes a
    // real DOM write, then clearing the filter forces a second real write
    // reflecting the CURRENT, correctly-computed status — this exercises
    // the exact same production code path (pickSlotAppointment →
    // getDisplayStatus → getStatusStyle) a real user's own subsequent
    // interactions (any filter/day/professional change) would always
    // trigger, well before they ever click into the cell.
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Estado"))?.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("li button")).find((b) => b.textContent.trim() === "Completada")?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button[aria-label^="Quitar filtro"]')).find((b) => b.getAttribute("aria-label")?.includes("Estado"))?.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    const slotClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => b.textContent.includes("8:00 AM") && b.textContent.includes("Laura") && !b.closest('[role="dialog"]'));
      if (!btn) return { ok: false };
      const classList = Array.from(btn.classList);
      btn.click();
      return { ok: true, classList };
    });
    assert(slotClicked.ok === true, "found and clicked the single visible 8:00 AM slot cell", failures);
    // The grid cell itself must read as "confirmed" styling (see
    // real-status.ts's REAL_STATUS_STYLES.confirmed), not "completed" —
    // the actual collision would otherwise still show through visually
    // even before opening the modal.
    if (slotClicked.ok) {
      assert(
        slotClicked.classList?.includes("border-primary/25") ?? false,
        "the slot cell itself is styled as confirmed (border-primary/25), not completed",
        failures,
      );
    }
    await new Promise((r) => setTimeout(r, 500));

    const modalInfo = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label^="Cita de"]');
      if (!dialog) return { dialogOpen: false };
      const buttons = Array.from(dialog.querySelectorAll("button")).map((b) => b.textContent.trim());
      const text = dialog.innerText;
      return {
        dialogOpen: true,
        showsConfirmada: text.includes("Confirmada"),
        showsCompletada: text.includes("Completada"),
        showsRightReason: text.includes("Chequeo general"),
        showsWrongReason: text.includes("Consulta de ortodoncia"),
        hasIniciar: buttons.some((b) => b.includes("Iniciar atención")),
      };
    });
    console.log("  modal state:", JSON.stringify(modalInfo));

    assert(modalInfo.dialogOpen === true, "detail modal opened", failures);
    assert(modalInfo.showsConfirmada === true, 'header shows "Confirmada" (the live Cita), not the stale completed one', failures);
    assert(modalInfo.showsCompletada === false, 'header does NOT show "Completada" — the status inconsistency is gone', failures);
    assert(modalInfo.showsRightReason === true, 'shows the confirmed Cita\'s own reason ("Chequeo general")', failures);
    assert(modalInfo.showsWrongReason === false, "does not show the OTHER (stale, completed) Cita's reason — this really is the right appointment, not a relabeled wrong one", failures);
    assert(modalInfo.hasIniciar === true, '"Iniciar atención" is offered at 8:02 AM for an 8:00 AM confirmed Cita', failures);

    await page.close();
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-slot-collision-status-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-slot-collision-status-check: OK — a slot collision no longer hides the live Cita or its status.");
}

main().catch((err) => {
  console.error("qa-slot-collision-status-check: script error:", err);
  process.exit(2);
});
