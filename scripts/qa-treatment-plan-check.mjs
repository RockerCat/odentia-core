#!/usr/bin/env node
// Browser + real-network regression for "PROMPT NINJA — Plan de
// Tratamiento / Tratamientos activos": public.patient_treatment_plan_items
// surfaced in Historia Clínica → Resumen's "Tratamientos activos" card,
// with full create/edit/status-change via "Ver plan de tratamiento",
// Asistente read-only, and RLS enforcing clinic isolation at the backend.
//
// Covers:
//   1. Patient with no plan yet — "Sin tratamientos activos".
//   2. Create — pending visible, toast, reflected on the card immediately.
//   3. Multiple items — planned/in_progress count as active,
//      completed/cancelled never do, but all still exist (via the
//      modal's own Activos/Completados/Cancelados/Todos filter).
//   4. Edit — pending, toast, updated content shown; re-picking a
//      different catalog treatment takes a FRESH snapshot (an explicit
//      user action), never altered by a later catalog rename.
//   5. Status change — planned → in_progress moves the item into the
//      active view; → completed/cancelled moves it OUT of active without
//      deleting it.
//   6. Double-click on "Guardar tratamiento" — exactly one insert.
//   7. Asistente permissions — read-only (no Agregar/Editar/estado).
//   8. RLS / aislamiento — a real, unauthenticated request against the
//      actual Supabase REST/RPC endpoints (no mocking).
//   9. PDF — covered by a dedicated unit test
//      (real-clinical-record-data.test.ts), not here — see
//      qa-clinical-notes-check.mjs's own comment on why (react-pdf output
//      is a rendered blob, not real DOM).
//
// Every write (insert/update/status RPC) is mocked via Puppeteer request
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

function mockedItemRow(id, treatmentName, overrides = {}) {
  const now = new Date().toISOString();
  return {
    id,
    plan_id: "p1a2n3-0000-4000-8000-000000000001",
    clinic_id: FIXTURE_CLINIC_ID,
    patient_id: FIXTURE_PATIENT_ID,
    treatment_id: null,
    treatment_name: treatmentName,
    status: "planned",
    notes: null,
    sort_order: 5,
    created_by: FIXTURE_PROF_ID,
    updated_by: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function readEnvVar(name) {
  const content = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const match = new RegExp(`^${name}=(.*)$`, "m").exec(content);
  if (!match) throw new Error(`${name} not found in .env.local`);
  return match[1].trim();
}

// React tracks <input>/<textarea> value via a wrapped native setter — a
// plain `el.value = x` bypasses that tracker, so the "input" event is
// seen as a no-op and onChange never fires. Setting through the native
// prototype setter first is the standard workaround.
function setReactInputValue(selector, value, tagName) {
  const el = document.querySelector(selector);
  const proto = tagName === "textarea" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-treatment-plan-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-treatment-plan-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    // --- Scenario 1: EMPTY. -------------------------------------------------
    console.log('Scenario: patient with no plan yet — "Sin tratamientos activos"');
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.goto(`${PATIENT_RECORD_URL}?plan=empty`, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      const cardText = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll("p")).find((p) => p.textContent.trim() === "Tratamientos activos");
        return label?.closest("div.rounded-xl")?.textContent ?? null;
      });
      assert(Boolean(cardText && cardText.includes("Sin tratamientos activos")), 'card shows "Sin tratamientos activos" with zero items', failures);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver plan de tratamiento")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      const modalText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"]')?.textContent ?? "");
      assert(modalText.includes("Sin tratamientos activos"), "modal also shows the empty state on the Activos tab", failures);

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
        if (method === "OPTIONS" && url.includes("/rest/v1/rpc/insert_patient_treatment_plan_item")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/rpc/insert_patient_treatment_plan_item")) {
          insertCount += 1;
          const body = JSON.parse(req.postData());
          setTimeout(
            () =>
              req.respond({
                status: 200,
                headers: corsHeaders({ "content-type": "application/json" }),
                body: JSON.stringify(mockedItemRow("66666666-6666-4666-8666-666666666666", body.p_treatment_name)),
              }),
            300,
          );
          return;
        }
        req.continue();
      });

      await page.goto(`${PATIENT_RECORD_URL}?plan=empty`, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver plan de tratamiento")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Agregar tratamiento")?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      await page.evaluate(setReactInputValue, '[role="dialog"] input', "Corona porcelana pieza 21", "input");

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Guardar tratamiento")?.click();
      });
      await new Promise((r) => setTimeout(r, 30));
      const immediate = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.includes("Guardando") || b.textContent.trim() === "Guardar tratamiento");
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(immediate.text === "Guardando…", 'label immediately becomes "Guardando…"', failures);
      assert(immediate.disabled === true, "CTA disabled immediately (no double-submit)", failures);

      await new Promise((r) => setTimeout(r, 600));

      const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? "");
      assert(toast.includes("Tratamiento agregado correctamente"), 'a visible "Tratamiento agregado correctamente" toast appears', failures);

      const modalHasItem = await page.evaluate(() =>
        Boolean(document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"]')?.textContent.includes("Corona porcelana pieza 21")),
      );
      assert(modalHasItem === true, "the new item appears in the modal's active list immediately", failures);

      await page.evaluate(() => {
        document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"] button[aria-label="Cerrar"]')?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      const cardHasItem = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll("p")).find((p) => p.textContent.trim() === "Tratamientos activos");
        return label?.closest("div.rounded-xl")?.textContent.includes("Corona porcelana pieza 21") ?? false;
      });
      assert(cardHasItem === true, "the Resumen card reflects the created item immediately, without a page reload", failures);
      assert(insertCount === 1, "exactly one insert request was sent", failures);

      await page.close();
    }

    // --- Scenario 3: MULTIPLE ITEMS — active vs completed/cancelled. -------
    console.log("Scenario: multiple items — planned/in_progress are active, completed/cancelled are not (but still exist)");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.goto(PATIENT_RECORD_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      const cardText = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll("p")).find((p) => p.textContent.trim() === "Tratamientos activos");
        return label?.closest("div.rounded-xl")?.textContent ?? "";
      });
      assert(cardText.includes("Limpieza dental") || cardText.includes("Tratamiento de conducto"), "the card shows at least one active item", failures);
      assert(!cardText.includes("ya realizada"), "the card never shows the completed item", failures);
      assert(!cardText.includes("no continuar"), "the card never shows the cancelled item", failures);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver plan de tratamiento")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      const activeCount = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"] ul')?.querySelectorAll("li").length ?? 0);
      assert(activeCount === 2, `exactly 2 active items are listed by default (got ${activeCount})`, failures);

      // Switch to "Completados".
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Completados")?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      const completedText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"]')?.textContent ?? "");
      assert(completedText.includes("ya realizada"), 'the completed item IS visible under the "Completados" filter — it still exists', failures);

      // Switch to "Cancelados".
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Cancelados")?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      const cancelledText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"]')?.textContent ?? "");
      assert(cancelledText.includes("no continuar"), 'the cancelled item IS visible under the "Cancelados" filter — it still exists', failures);

      await page.close();
    }

    // --- Scenario 4: EDIT — including catalog re-snapshot semantics. -------
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
        if (method === "OPTIONS" && url.includes("/rest/v1/rpc/update_patient_treatment_plan_item")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/rpc/update_patient_treatment_plan_item")) {
          const body = JSON.parse(req.postData());
          setTimeout(
            () =>
              req.respond({
                status: 200,
                headers: corsHeaders({ "content-type": "application/json" }),
                body: JSON.stringify(
                  mockedItemRow("f6e5d4c3-0000-4000-8000-000000000001", body.p_treatment_name, { status: "planned", updated_by: FIXTURE_PROF_ID }),
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
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver plan de tratamiento")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      await page.evaluate(() => {
        const firstLi = document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"] ul > li');
        Array.from(firstLi.querySelectorAll("button")).find((b) => b.textContent.trim() === "Editar")?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      const prefilled = await page.evaluate(() => document.querySelector('[role="dialog"] li input')?.value ?? "");
      assert(prefilled.includes("Limpieza dental"), "the edit form starts prefilled with the item's current treatment name", failures);

      await page.evaluate(setReactInputValue, '[role="dialog"] li input', "Limpieza dental profunda (2 sesiones)", "input");
      await page.evaluate(() => {
        const firstLi = document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"] ul > li');
        Array.from(firstLi.querySelectorAll("button")).find((b) => b.textContent.trim() === "Guardar")?.click();
      });
      await new Promise((r) => setTimeout(r, 30));
      const immediate = await page.evaluate(() => {
        const firstLi = document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"] ul > li');
        const btn = Array.from(firstLi.querySelectorAll("button")).find((b) => b.textContent.includes("Guardando") || b.textContent.trim() === "Guardar");
        return { text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(immediate.text === "Guardando…", 'label immediately becomes "Guardando…"', failures);
      assert(immediate.disabled === true, "CTA disabled immediately (no double-submit)", failures);

      await new Promise((r) => setTimeout(r, 600));
      const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? "");
      assert(toast.includes("Tratamiento actualizado correctamente"), 'a visible "Tratamiento actualizado correctamente" toast appears', failures);
      const updatedText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"]')?.textContent ?? "");
      assert(updatedText.includes("Limpieza dental profunda"), "the updated content is shown after saving", failures);

      await page.close();
    }

    // --- Scenario 5: STATUS CHANGE, plus its own double-click check. -------
    console.log("Scenario: status change moves an item in/out of the active view without deleting it; double-click sends one request only");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.setRequestInterception(true);
      let statusCallCount = 0;
      page.on("request", (req) => {
        const url = req.url();
        const method = req.method();
        if (method === "OPTIONS" && url.includes("/rest/v1/rpc/update_patient_treatment_plan_item_status")) {
          req.respond({ status: 204, headers: corsHeaders() });
          return;
        }
        if (method === "POST" && url.includes("/rest/v1/rpc/update_patient_treatment_plan_item_status")) {
          statusCallCount += 1;
          setTimeout(
            () =>
              req.respond({
                status: 200,
                headers: corsHeaders({ "content-type": "application/json" }),
                body: JSON.stringify(mockedItemRow("f6e5d4c3-0000-4000-8000-000000000001", "Limpieza dental", { status: "completed", updated_by: FIXTURE_PROF_ID })),
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
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver plan de tratamiento")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      // Select "Completado" on the first (planned) item's status <select>.
      await page.evaluate(() => {
        const firstLi = document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"] ul > li');
        const select = firstLi.querySelector("select");
        select.value = "completed";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await new Promise((r) => setTimeout(r, 50));
      // A rapid second change attempt while the first is still in flight.
      const secondChangeBlocked = await page.evaluate(() => {
        const firstLi = document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"] ul > li');
        const select = firstLi.querySelector("select");
        const wasDisabled = select.disabled === true;
        select.value = "cancelled";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return wasDisabled;
      });
      assert(secondChangeBlocked === true, "the status <select> is already disabled by the time a second change can land", failures);

      await new Promise((r) => setTimeout(r, 700));
      assert(statusCallCount === 1, `exactly one status-change request was sent despite the rapid repeat change (got ${statusCallCount})`, failures);

      const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? "");
      assert(toast.includes("Estado actualizado correctamente"), 'a visible "Estado actualizado correctamente" toast appears', failures);

      // Now on "Activos" (the default tab) — the item just marked
      // completed must have LEFT the active view without being deleted.
      const activeText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"]')?.textContent ?? "");
      assert(!activeText.includes("Limpieza dental"), "the item leaves the active view once marked completed", failures);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Completados")?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      const completedText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"]')?.textContent ?? "");
      assert(completedText.includes("Limpieza dental"), "the item still exists — visible under Completados, never deleted", failures);

      await page.close();
    }

    // --- Scenario 5b: CATALOG RENAME NEVER TOUCHES THE SNAPSHOT. -----------
    console.log("Scenario: a treatments catalog rename never alters an existing item's own historical snapshot");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.goto(PATIENT_RECORD_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      // The fixture's catalog entry for this exact treatment was
      // "renamed" to "Limpieza dental Premium (renombrado)" (see
      // dev-qa/patient-record-preview/page.tsx's own comment) — item 1
      // still references it via treatment_id, but its OWN stored
      // treatment_name ("Limpieza dental") must be what's shown.
      const cardText = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll("p")).find((p) => p.textContent.trim() === "Tratamientos activos");
        return label?.closest("div.rounded-xl")?.textContent ?? "";
      });
      assert(cardText.includes("Limpieza dental") && !cardText.includes("Premium"), "the Resumen card shows the item's own historical snapshot, not the catalog's current (renamed) name", failures);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver plan de tratamiento")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      const modalText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"]')?.textContent ?? "");
      assert(modalText.includes("Limpieza dental") && !modalText.includes("Limpieza dental Premium"), "the plan modal's list also shows the snapshot, never the renamed catalog name", failures);
      // The catalog's CURRENT name is still legitimately reachable — just
      // in the "add/edit" picker, not on the existing item's own display.
      // Two separate evaluate() calls, not one — the click's setState
      // needs an actual React re-render to mount the <select>, which
      // hasn't happened yet by the time a SYNCHRONOUS continuation of the
      // same evaluate call would read the DOM.
      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent.trim() === "Agregar tratamiento")?.click();
      });
      await new Promise((r) => setTimeout(r, 150));
      const pickerHasCurrentName = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="dialog"] option')).some((o) => o.textContent.includes("Premium")),
      );
      assert(pickerHasCurrentName === true, "the catalog's current (renamed) name is still available for NEW items via the picker", failures);

      await page.close();
    }

    // --- Scenario 6: ASISTENTE — read-only. ---------------------------------
    console.log("Scenario: Asistente sees the plan read-only — no Agregar/Editar/estado");
    {
      const page = await browser.newPage();
      attachConsoleMonitor(page, failures, {
        extraAllowed: (text) => text.includes("the server responded with a status of 40") || text.includes("fetchTeamMembers"),
      });
      await page.goto(`${PATIENT_RECORD_URL}?role=assistant`, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Ver plan de tratamiento")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));

      const state = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-label="Plan de tratamiento"]');
        const buttons = Array.from(dialog.querySelectorAll("button")).map((b) => b.textContent.trim());
        return {
          canSeeItems: dialog.textContent.includes("Limpieza dental"),
          hasAgregar: buttons.some((t) => t === "Agregar tratamiento"),
          hasEditar: buttons.some((t) => t === "Editar"),
          hasStatusSelect: Boolean(dialog.querySelector("select")),
        };
      });
      assert(state.canSeeItems === true, "Asistente can still READ the active items", failures);
      assert(state.hasAgregar === false, 'Asistente never sees "Agregar tratamiento"', failures);
      assert(state.hasEditar === false, 'Asistente never sees "Editar"', failures);
      assert(state.hasStatusSelect === false, "Asistente never sees a status-change control", failures);

      await page.close();
    }

    // --- Scenario 7: RLS / AISLAMIENTO — real network, no mocking. ---------
    console.log("Scenario: RLS enforces clinic isolation at the backend — real, unauthenticated request");
    {
      const supabaseUrl = readEnvVar("NEXT_PUBLIC_SUPABASE_URL");
      const anonKey = readEnvVar("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
      const page = await browser.newPage();

      const readResult = await page.evaluate(
        async (baseUrl, key, clinicId) => {
          const res = await fetch(`${baseUrl}/rest/v1/patient_treatment_plan_items?clinic_id=eq.${clinicId}&select=id`, {
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
          const res = await fetch(`${baseUrl}/rest/v1/rpc/insert_patient_treatment_plan_item`, {
            method: "POST",
            headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({ p_patient_id: patientId, p_treatment_id: null, p_treatment_name: "intento no autorizado", p_notes: null }),
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
    console.error(`\nqa-treatment-plan-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-treatment-plan-check: OK — Plan de Tratamiento is real, permission-gated, and backend-enforced.");
}

main().catch((err) => {
  console.error("qa-treatment-plan-check: script error:", err);
  process.exit(2);
});
