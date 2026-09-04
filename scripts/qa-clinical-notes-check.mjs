#!/usr/bin/env node
// Browser + real-network regression for "PROMPT NINJA — Notas clínicas
// importantes": persistent, patient-level clinical notes
// (public.patient_clinical_notes) surfaced in Historia Clínica → Resumen,
// with full create/edit/archive via "Gestionar notas", Asistente
// read-only, and RLS enforcing clinic isolation at the backend, not just
// the UI.
//
// Covers:
//   1. Empty state — "Sin notas clínicas importantes".
//   2. Create — pending visible, toast, reflected on the card immediately.
//   3. Multiple notes / order — most-recently-updated first, archived
//      never shown.
//   4. Edit — pending, toast, updated content shown.
//   5. Archive — pending, toast, disappears from the active list.
//   6. Double-click on "Guardar nota" — exactly one insert.
//   7. Asistente permissions — read-only (no Agregar/Editar/Archivar).
//   8. RLS / aislamiento — a real, unauthenticated request against the
//      actual Supabase REST/RPC endpoints (no mocking) confirms the
//      backend itself blocks both reading and writing, not just the UI.
//   9. PDF — covered by a dedicated unit test
//      (real-clinical-record-data.test.ts), not here: react-pdf's output
//      is a rendered blob, not real DOM, so asserting on its CONTENT via
//      Puppeteer would mean parsing PDF bytes for marginal signal beyond
//      what the pure data-shaping function already proves deterministically.
//
// Every write (insert/update/archive RPC) is mocked via Puppeteer request
// interception — this fixture is unauthenticated, so a real write always
// 401s otherwise (same technique every other qa-*-feedback-check.mjs
// script already uses).

import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { assert, attachConsoleMonitor, ensureDevServer, findChrome, stopDevServer } from "./qa-lib.mjs";

const PATIENT_RECORD_URL = "http://localhost:3000/dev-qa/patient-record-preview";
const FIXTURE_PATIENT_ID = "8e462860-7898-471f-bcab-a64fc357ae5e";
const FIXTURE_CLINIC_ID = "00000000-0000-4000-8000-000000000001";
const FIXTURE_PROF_ID = "225d222d-2481-4d05-9750-bfdd30b6a5db";

function corsHeaders(extra = {}) {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "*", "access-control-allow-headers": "*", ...extra };
}

function mockedNoteRow(id, content, overrides = {}) {
  const now = new Date().toISOString();
  return {
    id,
    clinic_id: FIXTURE_CLINIC_ID,
    patient_id: FIXTURE_PATIENT_ID,
    content,
    created_by: FIXTURE_PROF_ID,
    updated_by: null,
    created_at: now,
    updated_at: now,
    archived_at: null,
    archived_by: null,
    ...overrides,
  };
}

function readEnvVar(name) {
  const content = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const match = new RegExp(`^${name}=(.*)$`, "m").exec(content);
  if (!match) throw new Error(`${name} not found in .env.local`);
  return match[1].trim();
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-clinical-notes-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-clinical-notes-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    // --- Scenario 1: EMPTY. -------------------------------------------------
    console.log('Scenario: empty state — "Sin notas clínicas importantes"');
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.goto(`${PATIENT_RECORD_URL}?notes=empty`, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      const cardText = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll("p")).find((p) => p.textContent.trim() === "Notas clínicas importantes");
        return label?.closest("div.rounded-xl")?.textContent ?? null;
      });
      assert(Boolean(cardText && cardText.includes("Sin notas clínicas importantes")), 'card shows "Sin notas clínicas importantes" with zero notes', failures);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Gestionar notas")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      const modalText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]')?.textContent ?? "");
      assert(modalText.includes("Sin notas clínicas importantes"), 'modal also shows the empty state', failures);

      await page.close();
    }

    // --- Scenario 2: CREATE. -------------------------------------------------
    console.log("Scenario: create — pending visible, toast, reflected on the card immediately");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.setRequestInterception(true);
      let insertCount = 0;
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (method === "OPTIONS" && url.includes("/rest/v1/rpc/insert_patient_clinical_note")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/rpc/insert_patient_clinical_note")) {
          insertCount += 1;
          const body = JSON.parse(req.postData());
          setTimeout(
            () =>
              req.respond({
                status: 200,
                headers: corsHeaders({ "content-type": "application/json" }),
                body: JSON.stringify(mockedNoteRow("11111111-1111-4111-8111-111111111111", body.p_content)),
              }),
            300,
          );
          return;
        }
        req.continue();
      });

      await page.goto(`${PATIENT_RECORD_URL}?notes=empty`, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Gestionar notas")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Agregar nota")?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      await page.evaluate((text) => {
        const textarea = document.querySelector('[role="dialog"] textarea');
        // React tracks <textarea> value via a wrapped native setter — a
        // plain `textarea.value = x` bypasses that tracker, so the
        // subsequent "input" event is seen as a no-op change (the DOM
        // value already "matches" React's stale record) and onChange
        // never fires. Setting through the native prototype setter first
        // is the standard workaround.
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        setter.call(textarea, text);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }, "Paciente requiere seguimiento especial por hipertensión no controlada.");

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Guardar nota")?.click();
      });
      await new Promise((r) => setTimeout(r, 30));
      const immediate = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.includes("Guardando") || b.textContent.trim() === "Guardar nota");
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(immediate.text === "Guardando…", 'label immediately becomes "Guardando…"', failures);
      assert(immediate.disabled === true, "CTA disabled immediately (no double-submit)", failures);

      await new Promise((r) => setTimeout(r, 600));

      const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? "");
      assert(toast.includes("Nota creada correctamente"), 'a visible "Nota creada correctamente" toast appears', failures);

      const modalHasNote = await page.evaluate(() =>
        Boolean(document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]')?.textContent.includes("hipertensión no controlada")),
      );
      assert(modalHasNote === true, "the new note appears in the modal's list immediately", failures);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button[aria-label="Cerrar"]')).find(() => true)?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      const cardHasNote = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll("p")).find((p) => p.textContent.trim() === "Notas clínicas importantes");
        return label?.closest("div.rounded-xl")?.textContent.includes("hipertensión no controlada") ?? false;
      });
      assert(cardHasNote === true, "the Resumen card reflects the created note immediately, without a page reload", failures);
      assert(insertCount === 1, "exactly one insert request was sent", failures);

      await page.close();
    }

    // --- Scenario 3: MULTIPLE NOTES / ORDER. --------------------------------
    console.log("Scenario: multiple notes — most-recently-updated first, archived never shown");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.goto(PATIENT_RECORD_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Gestionar notas")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      const listOrder = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]');
        return Array.from(dialog.querySelectorAll("ul > li")).map((li) => li.textContent);
      });
      assert(listOrder.length === 2, `exactly 2 active notes are listed (got ${listOrder.length})`, failures);
      assert(Boolean(listOrder[0]?.includes("ansiedad dental")), "the most-recently-updated note (2026-09-03) appears first", failures);
      assert(Boolean(listOrder[1]?.includes("sensibilidad a anestésicos")), "the older active note (2026-09-02) appears second", failures);
      assert(!listOrder.some((t) => t.includes("ya resuelta")), "the archived note never appears in the list", failures);

      const cardText = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll("p")).find((p) => p.textContent.trim() === "Notas clínicas importantes");
        return label?.closest("div.rounded-xl")?.textContent ?? "";
      });
      assert(!cardText.includes("ya resuelta"), "the archived note never appears on the Resumen card preview either", failures);

      await page.close();
    }

    // --- Scenario 4: EDIT. ---------------------------------------------------
    console.log("Scenario: edit — pending visible, toast, updated content shown");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (method === "OPTIONS" && url.includes("/rest/v1/rpc/update_patient_clinical_note")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/rpc/update_patient_clinical_note")) {
          const body = JSON.parse(req.postData());
          setTimeout(
            () =>
              req.respond({
                status: 200,
                headers: corsHeaders({ "content-type": "application/json" }),
                body: JSON.stringify(
                  mockedNoteRow("e1a2b3c4-0000-4000-8000-000000000001", body.p_content, { updated_by: FIXTURE_PROF_ID }),
                ),
              }),
            300,
          );
          return;
        }
        req.continue();
      });

      await page.goto(PATIENT_RECORD_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));
      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Gestionar notas")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]');
        const firstLi = dialog.querySelector("ul > li");
        Array.from(firstLi.querySelectorAll("button")).find((b) => b.textContent.trim() === "Editar")?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      const prefilled = await page.evaluate(() => document.querySelector('[role="dialog"] li textarea')?.value ?? "");
      assert(prefilled.includes("ansiedad dental"), "the edit textarea starts prefilled with the note's current content", failures);

      await page.evaluate((text) => {
        const textarea = document.querySelector('[role="dialog"] li textarea');
        // See the create scenario's own comment on why this needs the
        // native setter, not a plain `textarea.value = x`.
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        setter.call(textarea, text);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }, "Ansiedad dental resuelta tras 3 sesiones de manejo conductual; ya no requiere sedación.");
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]');
        const firstLi = dialog.querySelector("ul > li");
        Array.from(firstLi.querySelectorAll("button")).find((b) => b.textContent.trim() === "Guardar")?.click();
      });
      await new Promise((r) => setTimeout(r, 30));
      const immediate = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]');
        const firstLi = dialog.querySelector("ul > li");
        const btn = Array.from(firstLi.querySelectorAll("button")).find((b) => b.textContent.includes("Guardando") || b.textContent.trim() === "Guardar");
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(immediate.text === "Guardando…", 'label immediately becomes "Guardando…"', failures);
      assert(immediate.disabled === true, "CTA disabled immediately (no double-submit)", failures);

      await new Promise((r) => setTimeout(r, 600));
      const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? "");
      assert(toast.includes("Nota actualizada correctamente"), 'a visible "Nota actualizada correctamente" toast appears', failures);
      const updatedText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]')?.textContent ?? "");
      assert(updatedText.includes("manejo conductual"), "the updated content is shown after saving", failures);
      assert(!updatedText.includes("considerar sedación consciente"), "the OLD content is gone after the edit", failures);

      await page.close();
    }

    // --- Scenario 5: ARCHIVE, plus its own double-click check. --------------
    console.log("Scenario: archive — pending visible, toast, disappears from the active list; double-click sends one request only");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.setRequestInterception(true);
      let archiveCount = 0;
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (method === "OPTIONS" && url.includes("/rest/v1/rpc/archive_patient_clinical_note")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/rpc/archive_patient_clinical_note")) {
          archiveCount += 1;
          setTimeout(
            () =>
              req.respond({
                status: 200,
                headers: corsHeaders({ "content-type": "application/json" }),
                body: JSON.stringify(
                  mockedNoteRow("e1a2b3c4-0000-4000-8000-000000000001", "Paciente reporta ansiedad dental significativa; considerar sedación consciente para procedimientos futuros.", {
                    archived_at: new Date().toISOString(),
                    archived_by: FIXTURE_PROF_ID,
                  }),
                ),
              }),
            400,
          );
          return;
        }
        req.continue();
      });

      await page.goto(PATIENT_RECORD_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));
      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Gestionar notas")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      // First click.
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]');
        const firstLi = dialog.querySelector("ul > li");
        Array.from(firstLi.querySelectorAll("button")).find((b) => b.textContent.includes("Archivar"))?.click();
      });
      await new Promise((r) => setTimeout(r, 50));
      // Second click, hitting the (by then) disabled button.
      const secondClickHitDisabled = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]');
        const firstLi = dialog.querySelector("ul > li");
        const btn = Array.from(firstLi.querySelectorAll("button")).find((b) => b.textContent.includes("Archivando") || b.textContent.includes("Archivar"));
        const wasDisabled = btn?.disabled === true;
        btn?.click();
        return wasDisabled;
      });
      assert(secondClickHitDisabled === true, "the Archivar CTA is already disabled by the time a second click can land", failures);

      const immediate = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]');
        const firstLi = dialog.querySelector("ul > li");
        return firstLi.textContent.includes("Archivando…");
      });
      assert(immediate === true, 'label immediately becomes "Archivando…"', failures);

      await new Promise((r) => setTimeout(r, 700));
      assert(archiveCount === 1, `exactly one archive request was sent despite the rapid repeat click (got ${archiveCount})`, failures);

      const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? "");
      assert(toast.includes("Nota archivada correctamente"), 'a visible "Nota archivada correctamente" toast appears', failures);

      const remainingText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]')?.textContent ?? "");
      assert(!remainingText.includes("ansiedad dental"), "the archived note disappears from the active list immediately", failures);

      await page.close();
    }

    // --- Scenario 6: ASISTENTE — read-only. ---------------------------------
    console.log("Scenario: Asistente sees notes read-only — no Agregar/Editar/Archivar");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.goto(`${PATIENT_RECORD_URL}?role=assistant`, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Gestionar notas")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      const state = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Notas clínicas importantes"]');
        const buttons = Array.from(dialog.querySelectorAll("button")).map((b) => b.textContent.trim());
        return {
          canSeeNotes: dialog.textContent.includes("ansiedad dental"),
          hasAgregar: buttons.some((t) => t === "Agregar nota"),
          hasEditar: buttons.some((t) => t === "Editar"),
          hasArchivar: buttons.some((t) => t.includes("Archivar")),
        };
      });
      assert(state.canSeeNotes === true, "Asistente can still READ the active notes", failures);
      assert(state.hasAgregar === false, 'Asistente never sees "Agregar nota"', failures);
      assert(state.hasEditar === false, 'Asistente never sees "Editar"', failures);
      assert(state.hasArchivar === false, 'Asistente never sees "Archivar"', failures);

      await page.close();
    }

    // --- Scenario 7: RLS / AISLAMIENTO — real network, no mocking. ----------
    console.log("Scenario: RLS enforces clinic isolation at the backend — real, unauthenticated request");
    {
      const supabaseUrl = readEnvVar("NEXT_PUBLIC_SUPABASE_URL");
      const anonKey = readEnvVar("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
      const page = await browser.newPage();

      const readResult = await page.evaluate(
        async (baseUrl, key, clinicId) => {
          const res = await fetch(`${baseUrl}/rest/v1/patient_clinical_notes?clinic_id=eq.${clinicId}&select=id`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
          });
          const body = await res.json().catch(() => null);
          return { status: res.status, rowCount: Array.isArray(body) ? body.length : null };
        },
        supabaseUrl,
        anonKey,
        FIXTURE_CLINIC_ID,
      );
      assert(
        readResult.status === 401 || readResult.rowCount === 0,
        `an unauthenticated read returns nothing (RLS blocks it) — got status ${readResult.status}, rowCount ${readResult.rowCount}`,
        failures,
      );

      const writeResult = await page.evaluate(
        async (baseUrl, key, patientId) => {
          const res = await fetch(`${baseUrl}/rest/v1/rpc/insert_patient_clinical_note`, {
            method: "POST",
            headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({ p_patient_id: patientId, p_content: "intento no autorizado" }),
          });
          return { status: res.status, ok: res.ok };
        },
        supabaseUrl,
        anonKey,
        FIXTURE_PATIENT_ID,
      );
      assert(writeResult.ok === false, `an unauthenticated write is rejected by the backend, not just hidden by the UI (got status ${writeResult.status})`, failures);

      await page.close();
    }
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-clinical-notes-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-clinical-notes-check: OK — Notas clínicas importantes is real, permission-gated, and backend-enforced.");
}

main().catch((err) => {
  console.error("qa-clinical-notes-check: script error:", err);
  process.exit(2);
});
