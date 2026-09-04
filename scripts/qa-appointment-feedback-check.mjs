#!/usr/bin/env node
// Browser regression for "PROMPT NINJA — Confirmación de éxito al
// crear/reprogramar citas": create/reschedule must close the feedback loop
// (acción → pending → éxito visible → cita identificable en Agenda), never
// before the backend actually confirms success.
//
// Covers:
//   1. CREATE SUCCESS — modal closes only after backend success, a visible
//      "Cita creada correctamente" toast appears (via the new src/components/
//      toast.tsx primitive — this app had no toast/notification
//      infrastructure before this task), and the created appointment is
//      immediately visible in the Agenda grid (RealAppointmentsBoard jumps
//      `selectedDay` to the appointment's own day when it differs — see
//      that component's own `revealAppointment`).
//   2. CREATE ERROR — modal stays open, entered data survives, no success
//      toast, CTA re-enabled for a retry.
//   3. DOUBLE CLICK — exactly one insert request reaches the backend no
//      matter how fast "Crear cita" is clicked twice.
//   4. RESCHEDULE SUCCESS — moving Fecha/Horario on an existing Cita shows
//      a "Cita reprogramada correctamente" toast and the appointment
//      relocates in the grid to its new day/time.
//   5. NEXT APPOINTMENT SUCCESS — RealClinicalEncounterScreen's own
//      "Agendar próxima cita" reuses RealNewAppointmentModal verbatim, so
//      the same toast fires there too — regression-only, not a second
//      implementation.
//   6. No unexpected console.error/warning/pageerror across any of the
//      above.
//
// Every write here is mocked via request interception (test-harness only,
// same technique qa-loading-feedback-check.mjs's own Scenario 2 already
// uses) — both dev-qa fixtures are unauthenticated, so a real
// createAppointment/updateAppointment always 401s otherwise.

import puppeteer from "puppeteer-core";
import { allow401, assert, attachConsoleMonitor, ensureDevServer, findChrome, navigateDayStripTo, stopDevServer } from "./qa-lib.mjs";

const AGENDA_URL = "http://localhost:3000/dev-qa/agenda-preview";
const ENCOUNTER_URL = "http://localhost:3000/dev-qa/clinical-encounter-preview";

// Matches fixtures.ts's FUTURE_CONFIRMED_APPOINTMENT_ID row exactly
// (2026-09-05T13:00:00+00:00, confirmed, patient "Laura Diaz") — the only
// appointment the fixture has on that day, so rescheduling it can't run
// into the fixture's OWN documented hardcoded-date collision (see
// fixtures.ts's and qa-slot-collision-status-check.mjs's own comments):
// TODAY_EIGHT_AM_APPOINTMENT_ID now collides with a stale hardcoded
// `completed` row once the real calendar reached 2026-09-04, so moving
// it away and then asserting "no longer at the old slot" would actually
// find that OTHER, unrelated appointment still sitting there — not a
// regression in the create/reschedule feedback loop this script exists to
// verify.
const RESCHEDULE_APPOINTMENT_ID = "d3f8b6c1-9e2a-4b7d-8f1e-6a5c3d9b2e47";
const RESCHEDULE_APPOINTMENT_DAY_NUM = 5;
const RESCHEDULE_APPOINTMENT_STARTS_AT = "2026-09-05T13:00:00+00:00";

function corsHeaders(extra = {}) {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "*", "access-control-allow-headers": "*", ...extra };
}

function mockedRowFromInsertBody(req, id) {
  const body = JSON.parse(req.postData());
  const now = new Date().toISOString();
  return {
    id,
    clinic_id: body.clinic_id,
    patient_id: body.patient_id,
    professional_profile_id: body.professional_profile_id,
    starts_at: body.starts_at,
    duration_minutes: body.duration_minutes,
    reason: body.reason ?? null,
    room: body.room ?? null,
    contact_phone: body.contact_phone ?? null,
    notes: body.notes ?? null,
    status: "confirmed",
    patient_arrived_at: null,
    created_at: now,
    updated_at: now,
  };
}

// Fills patient + professional (the fixture has exactly one of each) and
// opens the Fecha/Horario popovers, picking `dayNum` (day-of-month) and a
// fixed 10:00 AM slot — mirrors qa-loading-feedback-check.mjs's own
// "Crear cita" scenario, extended to actually complete the flow instead of
// only checking the immediate pending label.
async function fillNewAppointmentForm(page, dayNum) {
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim().includes("Nueva cita"))?.click();
  });
  await new Promise((r) => setTimeout(r, 400));

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
  await page.evaluate((num) => {
    const btn = Array.from(document.querySelectorAll(".grid.grid-cols-4 button")).find((b) => b.querySelector("span:last-child")?.textContent.trim() === String(num));
    btn?.click();
  }, dayNum);
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
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-appointment-feedback-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-appointment-feedback-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    // --- Scenario 1: CREATE SUCCESS. --------------------------------------
    console.log("Scenario: create success — modal closes, toast confirms, appointment visible in Agenda");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, { extraAllowed: allow401 });
      await page.setRequestInterception(true);
      let insertCount = 0;
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (method === "OPTIONS" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/appointments")) {
          insertCount += 1;
          // Deliberately slowed (test-harness only) so the "Creando…"
          // pending state has a real, reliably observable window instead of
          // racing headless Chrome's own timing against an instantly
          // resolved local mock.
          setTimeout(
            () =>
              req.respond({
                status: 201,
                headers: corsHeaders({ "content-type": "application/json" }),
                body: JSON.stringify(mockedRowFromInsertBody(req, "22222222-2222-4222-8222-222222222222")),
              }),
            300,
          );
          return;
        }
        if (method === "GET" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 200, headers: corsHeaders({ "content-type": "application/json" }), body: "[]" });
          return;
        }
        req.continue();
      });

      await page.goto(AGENDA_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      const tomorrow = await page.evaluate(() => new Date(Date.now() + 86400000).getDate());
      await fillNewAppointmentForm(page, tomorrow);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"][aria-label="Nueva cita"] button')).find((b) => b.textContent.includes("Crear cita"))?.click();
      });
      await new Promise((r) => setTimeout(r, 30));
      const immediate = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Nueva cita"]');
        const btn = Array.from(dialog?.querySelectorAll("button") ?? []).find((b) => b.textContent.includes("Creando") || b.textContent.includes("Crear cita"));
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(immediate.text === "Creando…", 'label immediately becomes "Creando…"', failures);
      assert(immediate.disabled === true, "CTA disabled immediately (no double-submit)", failures);

      await new Promise((r) => setTimeout(r, 500));

      const dialogClosed = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Nueva cita"]'));
      assert(dialogClosed === true, "modal closes only after backend confirms success", failures);

      const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? "");
      assert(toast.includes("Cita creada correctamente"), 'a visible "Cita creada correctamente" toast appears', failures);
      assert(toast.includes("Laura"), "toast includes the patient's name", failures);
      assert(toast.includes("10:00 AM"), "toast includes the appointment time", failures);

      const visibleInGrid = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return buttons.some((b) => !b.closest('[role="dialog"]') && b.textContent.includes("10:00 AM") && b.textContent.includes("Laura"));
      });
      assert(visibleInGrid === true, "Agenda immediately reflects the created appointment (day auto-switched if needed)", failures);
      assert(insertCount === 1, "exactly one insert request was sent", failures);

      await page.close();
    }

    // --- Scenario 2: CREATE ERROR. -----------------------------------------
    console.log("Scenario: create error — modal stays open, data preserved, no success toast, CTA re-enabled");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        // The mocked 400 itself is expected noise here (this scenario's
        // whole point is exercising the failure path) — same convention
        // qa-loading-feedback-check.mjs already uses for its own mocked
        // failure responses.
        extraAllowed: (text) => allow401(text) || text.includes("mocked failure") || text.includes("the server responded with a status of 400"),
      });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (method === "OPTIONS" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/appointments")) {
          req.respond({
            status: 400,
            headers: corsHeaders({ "content-type": "application/json" }),
            body: JSON.stringify({ message: "mocked failure", code: "PGRST000" }),
          });
          return;
        }
        if (method === "GET" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 200, headers: corsHeaders({ "content-type": "application/json" }), body: "[]" });
          return;
        }
        req.continue();
      });

      await page.goto(AGENDA_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      const tomorrow = await page.evaluate(() => new Date(Date.now() + 86400000).getDate());
      await fillNewAppointmentForm(page, tomorrow);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"][aria-label="Nueva cita"] button')).find((b) => b.textContent.includes("Crear cita"))?.click();
      });
      await new Promise((r) => setTimeout(r, 500));

      const state = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Nueva cita"]');
        if (!dialog) return { dialogOpen: false };
        const btn = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent.includes("Creando") || b.textContent.includes("Crear cita"));
        const patientSelected = dialog.querySelector('input[placeholder="Buscar paciente…"]') === null; // Combobox swaps to the selected-value view once chosen
        const errorEl = dialog.querySelector(".text-danger");
        return { dialogOpen: true, ctaText: btn?.textContent.trim(), ctaDisabled: btn?.disabled, patientSelected, error: errorEl?.textContent.trim() ?? null };
      });
      assert(state.dialogOpen === true, "modal stays open after a backend failure", failures);
      assert(state.ctaText === "Crear cita", 'CTA label restores to "Crear cita" (not left on "Creando…")', failures);
      assert(state.ctaDisabled === false, "CTA is re-enabled for a retry", failures);
      assert(state.patientSelected === true, "entered data (selected patient) is preserved", failures);
      assert(Boolean(state.error), "a visible error message is shown", failures);

      const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? "");
      assert(!toast.includes("Cita creada correctamente"), "no success toast appears on failure", failures);

      await page.close();
    }

    // --- Scenario 3: DOUBLE CLICK. ------------------------------------------
    console.log("Scenario: double-clicking Crear cita only sends one insert request");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, { extraAllowed: allow401 });
      await page.setRequestInterception(true);
      let insertCount = 0;
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (method === "OPTIONS" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/appointments")) {
          insertCount += 1;
          // Deliberately slowed (test-harness only) so a rapid second click
          // has a real window to land while the first request is in flight.
          setTimeout(
            () =>
              req.respond({
                status: 201,
                headers: corsHeaders({ "content-type": "application/json" }),
                body: JSON.stringify(mockedRowFromInsertBody(req, "33333333-3333-4333-8333-333333333333")),
              }),
            600,
          );
          return;
        }
        if (method === "GET" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 200, headers: corsHeaders({ "content-type": "application/json" }), body: "[]" });
          return;
        }
        req.continue();
      });

      await page.goto(AGENDA_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      const tomorrow = await page.evaluate(() => new Date(Date.now() + 86400000).getDate());
      await fillNewAppointmentForm(page, tomorrow);

      // Two SEPARATE round-trips (not three .click() calls back to back in
      // one synchronous block) — real double-clicks are two distinct
      // native browser events with React free to re-render/disable the
      // button in between, unlike firing multiple .click() calls from one
      // synchronous script block, which can batch away the intermediate
      // commit and isn't representative of an actual user's double-click.
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Nueva cita"]');
        Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent.includes("Crear cita"))?.click();
      });
      await new Promise((r) => setTimeout(r, 50));
      const secondClickHitDisabledButton = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Nueva cita"]');
        const btn = Array.from(dialog?.querySelectorAll("button") ?? []).find((b) => b.textContent.includes("Creando") || b.textContent.includes("Crear cita"));
        const wasDisabled = btn?.disabled === true;
        btn?.click();
        return wasDisabled;
      });
      await new Promise((r) => setTimeout(r, 1000));

      assert(secondClickHitDisabledButton === true, "CTA is already disabled by the time a second click can land", failures);
      assert(insertCount === 1, `exactly one insert request was sent regardless of a rapid repeat click (got ${insertCount})`, failures);
      await page.close();
    }

    // --- Scenario 4: RESCHEDULE SUCCESS. ------------------------------------
    console.log("Scenario: reschedule success — toast confirms, appointment relocates in the grid");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, { extraAllowed: allow401 });
      await page.setRequestInterception(true);
      let patchCount = 0;
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (method === "OPTIONS" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "GET" && url.includes("/rest/v1/appointments")) {
          if (url.includes(`id=eq.${RESCHEDULE_APPOINTMENT_ID}`)) {
            req.respond({
              status: 200,
              headers: corsHeaders({ "content-type": "application/json" }),
              body: JSON.stringify({
                clinic_id: "00000000-0000-4000-8000-000000000001",
                professional_profile_id: "225d222d-2481-4d05-9750-bfdd30b6a5db",
                starts_at: RESCHEDULE_APPOINTMENT_STARTS_AT,
                duration_minutes: 30,
              }),
            });
            return;
          }
          req.respond({ status: 200, headers: corsHeaders({ "content-type": "application/json" }), body: "[]" });
          return;
        }
        if (method === "PATCH" && url.includes("/rest/v1/appointments")) {
          patchCount += 1;
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        req.continue();
      });

      await page.goto(AGENDA_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      const navigated = await navigateDayStripTo(page, RESCHEDULE_APPOINTMENT_DAY_NUM);
      assert(navigated === true, `found and selected the day-of-month ${RESCHEDULE_APPOINTMENT_DAY_NUM} tab`, failures);
      await new Promise((r) => setTimeout(r, 300));

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        buttons.find((b) => b.textContent.includes("8:00 AM") && b.textContent.includes("Laura") && !b.closest('[role="dialog"]'))?.click();
      });
      await new Promise((r) => setTimeout(r, 500));

      const dialogOpened = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label^="Cita de"]')));
      assert(dialogOpened === true, "detail modal opened", failures);

      await page.evaluate(() => {
        document.querySelector('[role="dialog"][aria-label^="Cita de"] button[aria-label="Editar Horario"]')?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate(() => {
        const select = document.getElementById("time-popover-start");
        select.value = "4:00 PM";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Guardar")?.click();
      });
      await new Promise((r) => setTimeout(r, 500));

      const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? "");
      assert(toast.includes("Cita reprogramada correctamente"), 'a visible "Cita reprogramada correctamente" toast appears', failures);
      assert(toast.includes("4:00 PM"), "toast reflects the new time", failures);

      const relocated = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return {
          atNewTime: buttons.some((b) => !b.closest('[role="dialog"]') && b.textContent.includes("4:00 PM") && b.textContent.includes("Laura")),
          atOldTime: buttons.some((b) => !b.closest('[role="dialog"]') && b.textContent.includes("8:00 AM") && b.textContent.includes("Laura")),
        };
      });
      assert(relocated.atNewTime === true, "appointment appears at its new time in the grid", failures);
      assert(relocated.atOldTime === false, "appointment no longer appears at its old time", failures);
      assert(patchCount === 1, "exactly one update request was sent", failures);

      await page.close();
    }

    // --- Scenario 5: NEXT APPOINTMENT SUCCESS ("Agendar próxima cita"). ----
    console.log('Scenario: "Agendar próxima cita" (RealClinicalEncounterScreen) shows the same success toast — reuses RealNewAppointmentModal verbatim');
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => allow401(text) || text.includes("failed [object Object]"),
      });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (method === "OPTIONS" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/appointments")) {
          req.respond({
            status: 201,
            headers: corsHeaders({ "content-type": "application/json" }),
            body: JSON.stringify(mockedRowFromInsertBody(req, "44444444-4444-4444-8444-444444444444")),
          });
          return;
        }
        if (method === "GET" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 200, headers: corsHeaders({ "content-type": "application/json" }), body: "[]" });
          return;
        }
        req.continue();
      });

      await page.goto(ENCOUNTER_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 1000));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Sí")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Agendar próxima cita")?.click();
      });
      await new Promise((r) => setTimeout(r, 400));

      const dialogOpened = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Nueva cita"]')));
      assert(dialogOpened === true, '"Agendar próxima cita" opens RealNewAppointmentModal', failures);

      if (dialogOpened) {
        const tomorrow = await page.evaluate(() => new Date(Date.now() + 86400000).getDate());
        const hasProf = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Nueva cita"] input[placeholder="Buscar profesional…"]')));
        if (hasProf) {
          await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Nueva cita"] input[placeholder="Buscar profesional…"]')?.focus());
          await new Promise((r) => setTimeout(r, 200));
          await page.evaluate(() => document.querySelector('[role="dialog"] li button')?.click());
          await new Promise((r) => setTimeout(r, 200));
        }
        await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Nueva cita"] button[aria-label="Editar Fecha"]')?.click());
        await new Promise((r) => setTimeout(r, 300));
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
        await new Promise((r) => setTimeout(r, 500));

        const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? "");
        assert(toast.includes("Cita creada correctamente"), '"Agendar próxima cita" shows the same success toast as Agenda → Nueva cita', failures);
      }

      await page.close();
    }
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-appointment-feedback-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-appointment-feedback-check: OK — create/reschedule close the feedback loop with a visible, backend-confirmed success signal.");
}

main().catch((err) => {
  console.error("qa-appointment-feedback-check: script error:", err);
  process.exit(2);
});
