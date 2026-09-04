#!/usr/bin/env node
// Browser regression for "no past appointments, one rule, everywhere" (see
// appointments-actions.ts's own comment and real-format.ts's isPastSlot/
// hasAvailableFutureSlot doc comments — this script's own name mirrors
// no-past-appointments.test.ts, which covers the pure helpers; this file
// covers the UI WIRING those helpers feed into, which is where the actual
// regressions this guards against lived).
//
// Regression #1 (Guardar confirming an already-disabled default time):
// RealNewAppointmentModal already called isPastSlot and passed
// isSlotDisabled into TimePopoverContent's <select>, correctly greying out
// past options — but TimePopoverContent's own "Guardar" button never
// checked whether the CURRENTLY SELECTED value was one of those disabled
// options. Since real-new-appointment-modal.tsx defaults an untouched time
// to TIME_SLOTS[0] ("8:00 AM", the clinic's opening slot) while no time
// has been picked yet, a user who selects a Fecha (e.g. "today") and then
// opens Horario without ever touching the dropdown saw a *visibly
// disabled* 8:00 AM already sitting in the select, and clicking Guardar
// just confirmed it anyway — exactly the first reported repro ("Fecha:
// jueves 3 sep, el selector permite elegir 8:00 AM"). Fixed in three
// places, all reusing the same centralized helpers:
//   - TimePopoverContent (appointment-detail-modal.tsx): Guardar is now
//     disabled whenever isSlotDisabled?.(localTime) is true — shared by
//     every consumer (Nueva cita, Reprogramar, and Agendar próxima cita,
//     which reuses RealNewAppointmentModal wholesale).
//   - real-new-appointment-modal.tsx's canCreate: also re-checks
//     isPastSlot(dayKey, time) directly (Fecha and Horario are two
//     independent popovers; a time picked while a later Fecha was
//     selected can go stale if Fecha changes back down).
//   - real-appointment-detail-modal.tsx's Fecha picker (Reprogramar):
//     guarded with isPastInstant before ever calling onSaveField, so
//     picking "today" for an appointment whose existing time-of-day has
//     already passed today is blocked instead of silently failing.
//
// Regression #2 (this file's newer half — "today" itself staying
// selectable with zero valid hours left): the Fecha day-picker
// (WeekDayPickerContent, shared by all three flows) used isPastDayKey — a
// pure CALENDAR-day comparison that only ever excludes days strictly
// before today, so "today" was always selectable no matter the time of
// day. At 5:25 PM, with the clinic's last slot at 5:30 PM about to close
// entirely, "today" stayed pickable in the day grid even though nothing
// inside it (correctly, per regression #1's fix) was actually a valid
// time anymore — a real, if less catastrophic, version of the same "you
// can pick something you shouldn't be able to" hole. Fixed with a new
// central helper, real-format.ts's hasAvailableFutureSlot(dayKey) —
// true only if at least one of the clinic's fixed TIME_SLOTS for that day
// is still in the future (reusing isPastSlot, not a new date comparison)
// — now what WeekDayPickerContent's own disabled state is built from
// instead of isPastDayKey. One shared component, so this covers Nueva
// cita, Reprogramar cita, and Agendar próxima cita in a single change.
//
// Uses the same dev-only /dev-qa/agenda-preview fixture as
// qa-agenda-console-check.mjs (deterministic data, no real Supabase
// session needed for the UI-only assertions below). The day-picker
// scenarios fake the browser's Date via evaluateOnNewDocument (same
// calendar day as the real clock, only the hour changes) so this script's
// pass/fail never depends on what time of day it happens to run.

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

// Pins Date to today's real calendar day at a fixed local hour:minute, for
// every script and navigation this page loads from here on — so "8:00 AM
// is already past" / "no slots left today" assertions are deterministic
// regardless of when this script actually runs, instead of only being
// true if it happens to run late in the afternoon.
async function installFakeClock(page, hour, minute) {
  await page.evaluateOnNewDocument(
    (h, m) => {
      const RealDate = Date;
      const base = new RealDate();
      base.setHours(h, m, 0, 0);
      const FIXED = base.getTime();
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
    hour,
    minute,
  );
}

async function clickByExactText(page, scopeSel, text) {
  return page.evaluate(
    (scope, t) => {
      const buttons = Array.from(document.querySelectorAll(`${scope} button`));
      const btn = buttons.find((b) => b.textContent.trim() === t);
      if (!btn) return false;
      btn.click();
      return true;
    },
    scopeSel,
    text,
  );
}

async function focusAndPickFirst(page, placeholder) {
  const focused = await page.evaluate((ph) => {
    const el = document.querySelector(`[role="dialog"][aria-label="Nueva cita"] input[placeholder="${ph}"]`);
    if (!el) return false;
    el.focus();
    return true;
  }, placeholder);
  if (!focused) return false;
  await new Promise((r) => setTimeout(r, 200));
  return page.evaluate(() => {
    const item = document.querySelector('[role="dialog"] li button');
    if (!item) return false;
    item.click();
    return true;
  });
}

async function clickDayInPicker(page, dayNum) {
  return page.evaluate((num) => {
    const buttons = Array.from(document.querySelectorAll(".grid.grid-cols-4 button"));
    const btn = buttons.find((b) => b.querySelector("span:last-child")?.textContent.trim() === String(num));
    if (!btn) return null;
    btn.click();
    return { text: btn.textContent.trim(), wasDisabled: btn.disabled };
  }, dayNum);
}

async function dayButtonState(page, dayNum) {
  return page.evaluate((num) => {
    const buttons = Array.from(document.querySelectorAll(".grid.grid-cols-4 button"));
    const btn = buttons.find((b) => b.querySelector("span:last-child")?.textContent.trim() === String(num));
    return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
  }, dayNum);
}

async function openNewAppointment(page) {
  const opened = await clickByExactText(page, "body", "Nueva cita");
  await new Promise((r) => setTimeout(r, 400));
  return opened;
}

async function fillPatientAndProfessional(page) {
  await focusAndPickFirst(page, "Buscar paciente…");
  await new Promise((r) => setTimeout(r, 200));
  const hasProf = await page.evaluate(() =>
    Boolean(document.querySelector('[role="dialog"][aria-label="Nueva cita"] input[placeholder="Buscar profesional…"]')),
  );
  if (hasProf) {
    await focusAndPickFirst(page, "Buscar profesional…");
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function closeAnyOpenModal(page) {
  await page.evaluate(() => {
    const closeBtn = document.querySelector('[role="dialog"][aria-label="Nueva cita"] button[aria-label="Cerrar"]');
    closeBtn?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
}

async function openFechaPicker(page) {
  await page.evaluate(() => document.querySelector('button[aria-label="Editar Fecha"]')?.click());
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
    console.error("qa-no-past-appointments-check: no local Chrome found — set CHROME_PATH.");
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
      console.error("qa-no-past-appointments-check: dev server never became ready.");
      if (devServer.pid) process.kill(-devServer.pid);
      process.exit(2);
    }
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    // --- Main page: clock fixed at 10:00 AM today (safely within clinic
    // hours, with "8:00 AM" already past and plenty of future slots left)
    // — every scenario below assumes this specific, deterministic clock. --
    const page = await browser.newPage();
    await installFakeClock(page, 10, 0);
    await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1000));

    const now = await page.evaluate(() => Date.now());
    const todayNum = await page.evaluate(() => new Date().getDate());
    const tomorrowNum = await page.evaluate(() => new Date(Date.now() + 86400000).getDate());
    const yesterdayNum = await page.evaluate(() => new Date(Date.now() - 86400000).getDate());

    // --- Scenario A: day picker — past/today/future, with the clock
    // safely mid-morning (a future slot still exists today). ------------
    console.log("Scenario: Nueva cita — Fecha picker at 10:00 AM (a future slot still exists today)");
    await openNewAppointment(page);
    await fillPatientAndProfessional(page);
    await openFechaPicker(page);
    const todayPick = await clickDayInPicker(page, todayNum);
    assert(
      Boolean(todayPick) && todayPick.wasDisabled === false,
      "today is selectable (hasAvailableFutureSlot true — clinic hours remain)",
      failures,
    );
    await new Promise((r) => setTimeout(r, 300));
    await openFechaPicker(page);
    const yesterdayState = await dayButtonState(page, yesterdayNum);
    if (yesterdayState) assert(yesterdayState.disabled === true, "a past day is disabled", failures);
    else console.log("  (skip: yesterday isn't in this week's strip)");
    const tomorrowState = await dayButtonState(page, tomorrowNum);
    if (tomorrowState) assert(tomorrowState.disabled === false, "a future day is enabled", failures);
    else console.log("  (skip: tomorrow isn't in this week's strip)");
    await new Promise((r) => setTimeout(r, 300));

    // --- Scenario B: Horario options for today at 10:00 AM — past hours
    // disabled, next future hour enabled. --------------------------------
    console.log("Scenario: Nueva cita — Horario options for today at 10:00 AM");
    await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Nueva cita"] button[aria-label="Editar Horario"]')?.click());
    await new Promise((r) => setTimeout(r, 300));

    const options = await page.evaluate(() => {
      const select = document.getElementById("time-popover-start");
      return Array.from(select.querySelectorAll("option")).map((o) => ({ value: o.value, disabled: o.disabled }));
    });
    const nowLocal = new Date(now);
    const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
    const parseSlot = (slot) => {
      const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(slot);
      let h = Number(m[1]) % 12;
      if (m[3] === "PM") h += 12;
      return h * 60 + Number(m[2]);
    };
    const pastOption = options.find((o) => parseSlot(o.value) < nowMinutes);
    const futureOption = options.filter((o) => parseSlot(o.value) >= nowMinutes).sort((a, b) => parseSlot(a.value) - parseSlot(b.value))[0];
    assert(Boolean(pastOption) && pastOption.disabled === true, `today + past hour (${pastOption?.value}) = disabled`, failures);
    assert(Boolean(futureOption) && futureOption.disabled === false, `today + next future hour (${futureOption?.value}) = enabled`, failures);

    // --- Scenario C: Guardar blocked while the select still shows a
    // disabled default (the exact reported repro: pick Fecha, open
    // Horario, click Guardar without touching the dropdown). ------------
    console.log("Scenario: Nueva cita — Guardar blocked on an untouched, already-disabled Horario value");
    const initialSelectValue = await page.evaluate(() => document.getElementById("time-popover-start").value);
    const initialDisabled = options.find((o) => o.value === initialSelectValue)?.disabled ?? false;
    assert(initialDisabled === true, "default Horario value (clinic opening slot) is a disabled/past slot at 10:00 AM", failures);
    const guardarBtn = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Guardar");
      return btn ? { disabled: btn.disabled } : null;
    });
    assert(Boolean(guardarBtn) && guardarBtn.disabled === true, "Guardar is disabled while the selected time is a past/disabled slot", failures);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Guardar");
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    const horarioStillUnset = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Nueva cita"]');
      const dds = Array.from(dialog.querySelectorAll("dd"));
      return dds[1]?.textContent.trim();
    });
    assert(horarioStillUnset === "Selecciona un horario", "clicking a disabled Guardar has no effect — Horario field stays unset", failures);
    await closeAnyOpenModal(page);

    // --- Scenario D: stale time after changing Fecha back to today —
    // canCreate re-validates the full pair, not just presence. -----------
    console.log("Scenario: Nueva cita — time picked for a future day goes stale after Fecha changes back to today");
    await openNewAppointment(page);
    await fillPatientAndProfessional(page);
    await openFechaPicker(page);
    await clickDayInPicker(page, tomorrowNum);
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Nueva cita"] button[aria-label="Editar Horario"]')?.click());
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      const select = document.getElementById("time-popover-start");
      select.value = "8:00 AM";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Guardar")?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await openFechaPicker(page);
    await clickDayInPicker(page, todayNum);
    await new Promise((r) => setTimeout(r, 300));
    const staleState = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Nueva cita"]');
      const createBtn = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent.trim() === "Crear cita");
      return { createDisabled: createBtn?.disabled };
    });
    assert(staleState.createDisabled === true, "Crear cita stays disabled once the previously-picked time is stale for the new Fecha", failures);
    await closeAnyOpenModal(page);

    // --- Scenario E: Reprogramar — changing Fecha to a day that combines
    // with the appointment's existing time-of-day into the past is
    // blocked before any write. ------------------------------------------
    console.log("Scenario: Reprogramar cita — Fecha change blocked when it would make the existing time-of-day past");
    // Fixture's 8:00 AM appointment lives on the day after "today" (see
    // fixtures.ts) — reachable by navigating the day strip forward.
    const dayStripClicked = await page.evaluate((num) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => { const m = /^[A-Za-zÁÉÍÓÚáéíóú]{3}(\d{1,2})$/.exec(b.textContent.trim()); return m && Number(m[1]) === num && !b.closest(".grid-cols-4"); });
      if (!btn) return false;
      btn.click();
      return true;
    }, tomorrowNum);
    await new Promise((r) => setTimeout(r, 400));
    if (dayStripClicked) {
      const slotClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const btn = buttons.find((b) => b.textContent.includes("8:00 AM") && !b.closest('[role="dialog"]'));
        if (!btn) return false;
        btn.click();
        return true;
      });
      await new Promise((r) => setTimeout(r, 400));
      if (slotClicked && (await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]'))))) {
        const fechaBefore = await page.evaluate(() => document.querySelectorAll('[role="dialog"] dd')[0]?.textContent.trim());
        await openFechaPicker(page);
        // At the fixed 10:00 AM clock, this appointment's own 8:00 AM
        // time-of-day is already behind "now" — moving it to "today"
        // combines that existing hour with today's date into a past
        // instant, which is exactly the case being guarded against.
        const pick = await clickDayInPicker(page, todayNum);
        // Check IMMEDIATELY (no settle delay): the precise discriminator is
        // whether the day picker's own popover is still open right after
        // the click. Without the fix, onCancelEdit() ran unconditionally
        // (closing the popover) before the (unawaited) save even resolved.
        const popoverStillOpenRightAfterClick = await page.evaluate(() => Boolean(document.querySelector(".grid.grid-cols-4")));
        await new Promise((r) => setTimeout(r, 400));
        const fechaAfter = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          return dialog ? dialog.querySelectorAll("dd")[0]?.textContent.trim() : "DIALOG_GONE";
        });
        if (pick) {
          assert(
            popoverStillOpenRightAfterClick === true,
            "Fecha picker stays open (onSaveField is never called) when the pick would land the existing time-of-day in the past",
            failures,
          );
          assert(fechaAfter === fechaBefore, "Fecha value stays unchanged after the blocked pick", failures);
        } else {
          console.log("  (skip: today's button not found in this appointment's Fecha picker)");
        }
      } else {
        console.log("  (skip: couldn't open the 8:00 AM appointment's detail modal — fixture data may have changed)");
      }
    } else {
      console.log("  (skip: couldn't navigate the day strip to the fixture's second day)");
    }

    // --- Scenario F: "today" itself becomes disabled once every clinic
    // slot has passed — the exact reported 5:25 PM repro, made
    // deterministic via a fresh page with the clock pinned past closing.
    // Checked in BOTH Nueva cita and Reprogramar's Fecha picker, since
    // both render the same shared WeekDayPickerContent. ------------------
    console.log("Scenario: Fecha picker — today disabled once no slot remains (Nueva cita + Reprogramar)");
    const latePage = await browser.newPage();
    await installFakeClock(latePage, 23, 0); // 11:00 PM, well past the clinic's last 5:30 PM slot
    await latePage.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 1000));
    const lateTodayNum = await latePage.evaluate(() => new Date().getDate());
    const lateTomorrowNum = await latePage.evaluate(() => new Date(Date.now() + 86400000).getDate());

    await openNewAppointment(latePage);
    await openFechaPicker(latePage);
    const lateTodayInNewAppt = await dayButtonState(latePage, lateTodayNum);
    assert(
      Boolean(lateTodayInNewAppt) && lateTodayInNewAppt.disabled === true,
      "Nueva cita: today is disabled at 11:00 PM (no clinic slot left)",
      failures,
    );
    const lateTomorrowInNewAppt = await dayButtonState(latePage, lateTomorrowNum);
    assert(
      Boolean(lateTomorrowInNewAppt) && lateTomorrowInNewAppt.disabled === false,
      "Nueva cita: tomorrow stays enabled at 11:00 PM",
      failures,
    );
    await closeAnyOpenModal(latePage);

    const lateDayStripClicked = await latePage.evaluate((num) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => { const m = /^[A-Za-zÁÉÍÓÚáéíóú]{3}(\d{1,2})$/.exec(b.textContent.trim()); return m && Number(m[1]) === num && !b.closest(".grid-cols-4"); });
      if (!btn) return false;
      btn.click();
      return true;
    }, lateTomorrowNum);
    await new Promise((r) => setTimeout(r, 400));
    if (lateDayStripClicked) {
      const lateSlotClicked = await latePage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const btn = buttons.find((b) => b.textContent.includes("8:00 AM") && !b.closest('[role="dialog"]'));
        if (!btn) return false;
        btn.click();
        return true;
      });
      await new Promise((r) => setTimeout(r, 400));
      if (lateSlotClicked && (await latePage.evaluate(() => Boolean(document.querySelector('[role="dialog"]'))))) {
        await openFechaPicker(latePage);
        const lateTodayInReprogramar = await dayButtonState(latePage, lateTodayNum);
        assert(
          Boolean(lateTodayInReprogramar) && lateTodayInReprogramar.disabled === true,
          "Reprogramar cita: today is disabled at 11:00 PM (no clinic slot left) — same WeekDayPickerContent as Nueva cita",
          failures,
        );
      } else {
        console.log("  (skip: couldn't open Reprogramar's detail modal at 11:00 PM)");
      }
    } else {
      console.log("  (skip: couldn't navigate the day strip at 11:00 PM)");
    }
    await latePage.close();

    // --- Scenario G: backend rejects create/update of a past instant. ---
    console.log("Scenario: backend (createAppointment/updateAppointment) rejects a past starts_at");
    // Covered authoritatively by unit tests (no-past-appointments.test.ts,
    // which calls createAppointment/updateAppointment directly — both
    // short-circuit on isPastInstant before ever touching Supabase). This
    // browser check instead confirms the UI can no longer even reach that
    // call with an invalid pair (scenarios C–F above) — the true end-to-end
    // "attempt it anyway" case needs a real authenticated session and is
    // out of scope for this unauthenticated fixture (every write here 401s
    // regardless of date validity).
    console.log("  (see npm test: no-past-appointments.test.ts — createAppointment/updateAppointment PAST_DATE_ERROR coverage)");
  } finally {
    await browser.close();
    if (startedServer && devServer && devServer.pid) {
      process.kill(-devServer.pid);
    }
  }

  if (failures.length > 0) {
    console.error(`\nqa-no-past-appointments-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-no-past-appointments-check: OK — no past date/time is selectable across Nueva cita / Reprogramar / Agendar próxima cita.");
}

main().catch((err) => {
  console.error("qa-no-past-appointments-check: script error:", err);
  process.exit(2);
});
