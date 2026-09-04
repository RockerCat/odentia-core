#!/usr/bin/env node
// Browser regression for "PROMPT NINJA — Cerrar gaps restantes de
// navegación programática": the four remaining plain "click → silence →
// navigation" gaps found by the previous nav-feedback audit
// (qa-nav-pending-check.mjs's own report) must now show immediate,
// contextual pending feedback that survives until the destination
// actually takes over the screen.
//
//   1. patient-record-modal.tsx — "Ver historia clínica"
//   2. real-clinical-encounter-screen.tsx — "Volver a Agenda"
//   3. real-clinical-encounter-screen.tsx — "Ver o modificar cita"
//   4. real-patient-appointment-history-screen.tsx — "Atrás" (the REAL
//      counterpart of the still-mock patient-appointment-history-screen.tsx
//      named in the original audit — see this repo's own real-*.tsx
//      convention; the mock file is never edited)
//
// Same auth constraint as qa-nav-pending-check.mjs (read that file's own
// top comment for the full explanation): every destination here is a real,
// proxy-gated private route, and this sandbox has no real Supabase
// session, so the correct, deterministic "navigation completed" signal is
// a redirect to /login — proof Next actually followed through, not a
// workaround. Every navigation request is HELD (not merely delayed) via
// Puppeteer interception and released only after the pending assertion,
// exactly like that script.

import puppeteer from "puppeteer-core";
import { allow401, assert, attachConsoleMonitor, ensureDevServer, findChrome, stopDevServer } from "./qa-lib.mjs";

const PATIENT_HISTORY_URL = "http://localhost:3000/dev-qa/patient-history-preview";
const AGENDA_URL = "http://localhost:3000/dev-qa/agenda-preview";
const ENCOUNTER_URL = "http://localhost:3000/dev-qa/clinical-encounter-preview";

function corsHeaders(extra = {}) {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "*", "access-control-allow-headers": "*", ...extra };
}

// Holds every request whose URL matches one of `patterns` instead of
// responding to it. Everything else (including dev-qa's own asset/RSC
// requests) passes through untouched.
function holdMatching(page, patterns, bucket) {
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("dev-qa")) {
      req.continue();
      return;
    }
    if (patterns.some((p) => url.includes(p))) {
      bucket.push(req);
      return;
    }
    req.continue();
  });
}

function release(bucket) {
  const held = bucket.splice(0);
  for (const req of held) {
    try {
      req.continue();
    } catch {
      // Already settled — nothing left to release.
    }
  }
  return held.length;
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

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-nav-followups-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-nav-followups-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    // --- Scenario 1: "Ver historia clínica" (patient-record-modal.tsx). ----
    console.log('Scenario: "Ver historia clínica" — click → pending visible → navigation completes');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      attachConsoleMonitor(page, failures, { extraAllowed: allow401 });
      const held = [];
      await page.setRequestInterception(true);
      holdMatching(page, ["/pacientes/"], held);

      await page.goto(AGENDA_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      // Open an appointment's detail modal, then "Ver paciente" (a plain,
      // synchronous local state change here — see real-appointments-board.tsx
      // — to reach PatientRecordModal).
      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("8:00 AM") && b.textContent.includes("Laura") && !b.closest('[role="dialog"]'))?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Ver paciente")?.click();
      });
      await new Promise((r) => setTimeout(r, 400));

      const modalOpen = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Laura Diaz"]')));
      assert(modalOpen === true, "PatientRecordModal opened", failures);

      const before = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Laura Diaz"]');
        const btn = Array.from(dialog?.querySelectorAll("button") ?? []).find((b) => b.textContent.includes("Ver historia clínica"));
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(before.text === "Ver historia clínica", "starts with the plain label", failures);
      assert(before.disabled === false, "starts enabled", failures);

      // CLICK.
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Laura Diaz"]');
        Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent.includes("Ver historia clínica"))?.click();
      });
      await new Promise((r) => setTimeout(r, 150));

      // FEEDBACK VISIBLE — before the held request is released.
      assert(held.length >= 1, "the navigation's own request is held (not yet resolved)", failures);
      const during = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Laura Diaz"]');
        const btn = Array.from(dialog?.querySelectorAll("button") ?? []).find((b) => b.textContent.includes("Abriendo historia clínica") || b.textContent.includes("Ver historia clínica"));
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(during.text === "Abriendo historia clínica…", 'label immediately becomes "Abriendo historia clínica…"', failures);
      assert(during.disabled === true, "CTA disabled immediately (no double-submit)", failures);

      // DESTINO — release only now.
      release(held);
      await new Promise((r) => setTimeout(r, 1200));
      assert(page.url().endsWith("/login"), "navigation actually completed (redirected to /login, unauthenticated)", failures);

      await page.close();
    }

    // --- Scenario 2: "Volver a Agenda" (real-clinical-encounter-screen.tsx),
    // plus its own double-click check. ---------------------------------------
    console.log('Scenario: "Volver a Agenda" — click → pending visible → navigation completes; double-click sends one navigation only');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      attachConsoleMonitor(page, failures, { extraAllowed: allow401 });
      const held = [];
      await page.setRequestInterception(true);
      holdMatching(page, ["/agenda"], held);

      await page.goto(ENCOUNTER_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      const before = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Volver a Agenda"));
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(before.text === "Volver a Agenda", "starts with the plain label", failures);
      assert(before.disabled === false, "starts enabled", failures);

      // Two clicks back-to-back (real double-click risk window) — only the
      // FIRST should register; the second must hit an already-disabled
      // button.
      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Volver a Agenda"))?.click();
      });
      await new Promise((r) => setTimeout(r, 50));
      const secondClickHitDisabled = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Volviendo a Agenda") || b.textContent.includes("Volver a Agenda"));
        const wasDisabled = btn?.disabled === true;
        btn?.click();
        return wasDisabled;
      });
      await new Promise((r) => setTimeout(r, 150));

      assert(secondClickHitDisabled === true, "the CTA is already disabled by the time a second click can land", failures);
      assert(held.length === 1, `exactly one navigation request was sent despite the rapid repeat click (got ${held.length})`, failures);

      const during = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Volviendo a Agenda") || b.textContent.includes("Volver a Agenda"));
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(during.text === "Volviendo a Agenda…", 'label immediately becomes "Volviendo a Agenda…"', failures);
      assert(during.disabled === true, "CTA stays disabled while pending", failures);

      release(held);
      await new Promise((r) => setTimeout(r, 1200));
      assert(page.url().endsWith("/login"), "navigation actually completed (redirected to /login, unauthenticated)", failures);

      await page.close();
    }

    // --- Scenario 3: "Ver o modificar cita" (real-clinical-encounter-screen.tsx). ---
    console.log('Scenario: "Ver o modificar cita" — click → pending visible → navigation completes');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => allow401(text) || text.includes("failed [object Object]"),
      });
      await page.setRequestInterception(true);
      const agendaHeld = [];
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (url.includes("dev-qa")) {
          req.continue();
          return;
        }
        if (method === "OPTIONS" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/appointments")) {
          req.respond({
            status: 201,
            headers: corsHeaders({ "content-type": "application/json" }),
            body: JSON.stringify(mockedRowFromInsertBody(req, "55555555-5555-4555-8555-555555555555")),
          });
          return;
        }
        if (method === "GET" && url.includes("/rest/v1/appointments")) {
          req.respond({ status: 200, headers: corsHeaders({ "content-type": "application/json" }), body: "[]" });
          return;
        }
        if (url.includes("/agenda")) {
          agendaHeld.push(req);
          return;
        }
        req.continue();
      });

      await page.goto(ENCOUNTER_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      // Schedule a "próxima cita" first — "Ver o modificar cita" only
      // renders once one exists (see real-clinical-encounter-screen.tsx's
      // own scheduledNextAppointment branch).
      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Sí")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Agendar próxima cita")?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      const hasProf = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Nueva cita"] input[placeholder="Buscar profesional…"]')));
      if (hasProf) {
        await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Nueva cita"] input[placeholder="Buscar profesional…"]')?.focus());
        await new Promise((r) => setTimeout(r, 200));
        await page.evaluate(() => document.querySelector('[role="dialog"] li button')?.click());
        await new Promise((r) => setTimeout(r, 200));
      }
      const tomorrow = await page.evaluate(() => new Date(Date.now() + 86400000).getDate());
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

      const scheduled = await page.evaluate(() => Boolean(Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver o modificar cita")));
      assert(scheduled === true, '"Ver o modificar cita" appears once a próxima cita is scheduled', failures);

      // CLICK.
      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver o modificar cita")?.click();
      });
      await new Promise((r) => setTimeout(r, 150));

      assert(agendaHeld.length >= 1, "the navigation's own request is held (not yet resolved)", failures);
      const during = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Abriendo cita") || b.textContent.trim() === "Ver o modificar cita");
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(during.text === "Abriendo cita…", 'label immediately becomes "Abriendo cita…"', failures);
      assert(during.disabled === true, "CTA disabled immediately (no double-submit)", failures);

      release(agendaHeld);
      await new Promise((r) => setTimeout(r, 1200));
      assert(page.url().endsWith("/login"), "navigation actually completed (redirected to /login, unauthenticated)", failures);

      await page.close();
    }

    // --- Scenario 4: "Atrás" (real-patient-appointment-history-screen.tsx). ---
    console.log('Scenario: "Atrás" — click → pending visible → navigation completes (reuses the Sidebar\'s own NavLinkContent)');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      attachConsoleMonitor(page, failures, {});
      const held = [];
      await page.setRequestInterception(true);
      holdMatching(page, ["/pacientes"], held);

      await page.goto(PATIENT_HISTORY_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      const before = await page.evaluate(() => {
        const link = Array.from(document.querySelectorAll("a")).find((a) => a.textContent.includes("Atrás"));
        return { found: Boolean(link), pending: Boolean(link?.querySelector(".animate-spin")) };
      });
      assert(before.found === true, '"Atrás" link found', failures);
      assert(before.pending === false, "no pending indicator before any click", failures);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("a")).find((a) => a.textContent.includes("Atrás"))?.click();
      });
      await new Promise((r) => setTimeout(r, 150));

      assert(held.length >= 1, "the navigation's own request is held (not yet resolved)", failures);
      const during = await page.evaluate(() => {
        const link = Array.from(document.querySelectorAll("a")).find((a) => a.textContent.includes("Atrás"));
        return { pending: Boolean(link?.querySelector(".animate-spin")), ariaBusy: link?.querySelector("[aria-busy]")?.getAttribute("aria-busy") };
      });
      assert(during.pending === true, "pending indicator appears immediately after the click", failures);
      assert(during.ariaBusy === "true", 'marked aria-busy="true" while pending', failures);

      release(held);
      await new Promise((r) => setTimeout(r, 1200));
      assert(page.url().endsWith("/login"), "navigation actually completed (redirected to /login, unauthenticated)", failures);

      await page.close();
    }
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-nav-followups-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-nav-followups-check: OK — every previously-identified programmatic navigation gap now gives immediate, contextual pending feedback.");
}

main().catch((err) => {
  console.error("qa-nav-followups-check: script error:", err);
  process.exit(2);
});
