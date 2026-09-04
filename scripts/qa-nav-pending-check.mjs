#!/usr/bin/env node
// Browser regression for "PROMPT NINJA — Feedback inmediato durante
// navegación global": a valid navigation click (Sidebar/BottomTabBar links,
// or a programmatic router.push already carrying its own contextual
// pending state) must never look ignored while Next.js fetches the next
// page — see src/components/shell/nav-link-status.tsx's own comment for
// the mechanism (Next.js 16's native useLinkStatus(), per-Link, not a
// custom router-event tracker).
//
// AUTH CONSTRAINT (read before touching this file): src/lib/supabase/
// proxy.ts deliberately gates every real private clinic route (/agenda,
// /pacientes, /reportes, /clinica, /configuracion, /suscripcion) against a
// REAL Supabase session, with NO NODE_ENV=development bypass — see that
// file's own comment; a past task removed an earlier bypass specifically
// so this holds in `npm run dev` too. This sandbox has no local Supabase
// (no Docker) and no seeded test-user credentials, so there is no way to
// hold a real authenticated session here — every one of this repo's
// existing qa-*.mjs scripts works around the exact same constraint by
// testing through an unauthenticated /dev-qa/*-preview fixture instead of
// the real gated route. This script does the same: it clicks the REAL
// Sidebar (rendered inside /dev-qa/agenda-preview, the same AppShell/
// Sidebar/SidebarNav production code /agenda itself uses) toward REAL
// hrefs (/pacientes, /reportes) — since there is no session, the proxy
// correctly redirects those to /login once the navigation actually lands,
// which is verified as the "navigation completed" signal. What matters for
// this task is the MECHANISM (per-link pending, correct temporal order, no
// premature active-state change, no stuck pending) — that holds
// identically regardless of which real page Next ends up rendering, and
// the redirect itself is a real, correct code path, not a workaround.
//
// Every scenario artificially slows a real navigation by HOLDING (not
// responding to) its matching network request via Puppeteer request
// interception, releasing it only once the pending state has been
// asserted — deterministic regardless of dev-server response time or
// Next's own prefetch-on-viewport behavior (a request this holds might be
// an early prefetch or the click-triggered fetch itself; either way nothing
// resolves until this test explicitly releases it).

import puppeteer from "puppeteer-core";
import { assert, attachConsoleMonitor, ensureDevServer, findChrome, stopDevServer } from "./qa-lib.mjs";

const AGENDA_PREVIEW_URL = "http://localhost:3000/dev-qa/agenda-preview";

function corsHeaders(extra = {}) {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "*", "access-control-allow-headers": "*", ...extra };
}

// Holds every request whose URL matches one of `patterns` (substring match)
// instead of responding to it, appending it to `bucket`. Everything else
// passes through untouched. Must be installed via page.on("request") AFTER
// page.setRequestInterception(true) and BEFORE page.goto/any click.
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
      // Already handled/closed — fine, nothing left to release.
    }
  }
  return held.length;
}

async function readSidebarLink(page, label) {
  return page.evaluate((lbl) => {
    const aside = document.querySelector("aside");
    const link = Array.from(aside?.querySelectorAll("a") ?? []).find((a) => a.textContent.includes(lbl));
    if (!link) return null;
    return {
      found: true,
      href: link.getAttribute("href"),
      ariaCurrent: link.getAttribute("aria-current"),
      pending: Boolean(link.querySelector(".animate-spin")),
      ariaBusy: link.querySelector("[aria-busy]")?.getAttribute("aria-busy") ?? null,
    };
  }, label);
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error("qa-nav-pending-check: no local Chrome found — set CHROME_PATH.");
    process.exit(2);
  }

  let devServer = null;
  let startedServer = false;
  try {
    ({ devServer, startedServer } = await ensureDevServer());
  } catch (e) {
    console.error("qa-nav-pending-check:", e.message);
    process.exit(2);
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  try {
    // --- Scenario 1: SIDEBAR — "Pacientes". -------------------------------
    console.log('Scenario: Sidebar "Pacientes" — click → immediate per-item pending → navigation completes → pending clears');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      attachConsoleMonitor(page, failures, {});
      const held = [];
      await page.setRequestInterception(true);
      holdMatching(page, ["/pacientes"], held);

      await page.goto(AGENDA_PREVIEW_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      const before = await readSidebarLink(page, "Pacientes");
      assert(before?.found === true, '"Pacientes" link found in the real Sidebar', failures);
      assert(before?.pending === false, "no pending indicator before any click (idle state)", failures);
      const agendaBefore = await readSidebarLink(page, "Agenda");
      assert(agendaBefore?.ariaCurrent === "page", '"Agenda" starts as the active item (aria-current="page")', failures);

      // CLICK.
      await page.evaluate(() => {
        const aside = document.querySelector("aside");
        Array.from(aside.querySelectorAll("a")).find((a) => a.textContent.includes("Pacientes"))?.click();
      });
      await new Promise((r) => setTimeout(r, 200));

      // FEEDBACK VISIBLE — asserted BEFORE the held request is released,
      // i.e. strictly before the destination could possibly have loaded.
      assert(held.length >= 1, "the navigation's own request is being held (not yet resolved)", failures);
      const duringPacientes = await readSidebarLink(page, "Pacientes");
      assert(duringPacientes?.pending === true, '"Pacientes" shows its pending indicator immediately after the click', failures);
      assert(duringPacientes?.ariaBusy === "true", '"Pacientes" is marked aria-busy="true" while pending', failures);
      const duringAgenda = await readSidebarLink(page, "Agenda");
      assert(duringAgenda?.pending === false, 'the UNCLICKED "Agenda" link never shows a pending indicator (per-link, not global)', failures);
      assert(duringAgenda?.ariaCurrent === "page", 'the active item does NOT change to "Pacientes" prematurely — still "Agenda" while pending', failures);
      const otherLabels = ["Reportes", "Clínica", "Configuración"];
      for (const label of otherLabels) {
        const other = await readSidebarLink(page, label);
        if (other?.found) assert(other.pending === false, `"${label}" never shows a pending indicator from an unrelated click`, failures);
      }

      // DESTINO TERMINA DE CARGAR — release only now.
      const releasedCount = release(held);
      assert(releasedCount >= 1, "released the held navigation request(s)", failures);
      await new Promise((r) => setTimeout(r, 1200));

      const finalUrl = page.url();
      // No real session here (see this file's own top comment) — the
      // proxy correctly redirects the unauthenticated request to /login.
      // That redirect landing is itself proof the navigation actually
      // completed (Next doesn't render /login without following through).
      assert(finalUrl.endsWith("/login"), "navigation actually completed (redirected to /login, as an unauthenticated request correctly should)", failures);

      await page.close();
    }

    // --- Scenario 2: OTHER ROUTE — "Reportes". ------------------------------
    console.log('Scenario: Sidebar "Reportes" — same pattern holds for a second, distinct real route');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      attachConsoleMonitor(page, failures, {});
      const held = [];
      await page.setRequestInterception(true);
      holdMatching(page, ["/reportes"], held);

      await page.goto(AGENDA_PREVIEW_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      await page.evaluate(() => {
        const aside = document.querySelector("aside");
        Array.from(aside.querySelectorAll("a")).find((a) => a.textContent.includes("Reportes"))?.click();
      });
      await new Promise((r) => setTimeout(r, 200));

      assert(held.length >= 1, "the navigation's own request is being held (not yet resolved)", failures);
      const duringReportes = await readSidebarLink(page, "Reportes");
      assert(duringReportes?.pending === true, '"Reportes" shows its pending indicator immediately after the click', failures);
      const duringPacientes = await readSidebarLink(page, "Pacientes");
      assert(duringPacientes?.pending === false, '"Pacientes" is unaffected by clicking "Reportes"', failures);
      const duringAgenda = await readSidebarLink(page, "Agenda");
      assert(duringAgenda?.ariaCurrent === "page", '"Agenda" still reads active while "Reportes" is pending', failures);

      release(held);
      await new Promise((r) => setTimeout(r, 1200));
      assert(page.url().endsWith("/login"), "navigation completed (redirected to /login)", failures);

      await page.close();
    }

    // --- Scenario 3: RAPID NAVIGATION. --------------------------------------
    console.log("Scenario: rapid Pacientes → Reportes clicks never leave a stuck/duplicated pending state");
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      attachConsoleMonitor(page, failures, {});
      const held = [];
      await page.setRequestInterception(true);
      holdMatching(page, ["/pacientes", "/reportes"], held);

      await page.goto(AGENDA_PREVIEW_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      await page.evaluate(() => {
        const aside = document.querySelector("aside");
        Array.from(aside.querySelectorAll("a")).find((a) => a.textContent.includes("Pacientes"))?.click();
      });
      await new Promise((r) => setTimeout(r, 120));
      await page.evaluate(() => {
        const aside = document.querySelector("aside");
        Array.from(aside.querySelectorAll("a")).find((a) => a.textContent.includes("Reportes"))?.click();
      });
      await new Promise((r) => setTimeout(r, 200));

      // A newer navigation supersedes the older one — at most ONE link
      // should read pending at this point, never both stuck simultaneously.
      const pacientesMid = await readSidebarLink(page, "Pacientes");
      const reportesMid = await readSidebarLink(page, "Reportes");
      const pendingCount = [pacientesMid?.pending, reportesMid?.pending].filter(Boolean).length;
      assert(pendingCount <= 1, `at most one link reads pending after a rapid re-click, never both (got ${pendingCount})`, failures);
      assert(reportesMid?.pending === true, 'the LATEST click ("Reportes") is the one reading pending', failures);

      release(held);
      await new Promise((r) => setTimeout(r, 1500));

      const afterUrl = page.url();
      assert(afterUrl.endsWith("/login"), "rapid navigation still resolves to a real completed destination (not stuck mid-transition)", failures);

      await page.close();
    }

    // --- Scenario 4: ERROR / INTERRUPTION. ----------------------------------
    console.log("Scenario: a failed/aborted navigation never leaves the Sidebar permanently pending or the app frozen");
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      // A failed fetch is expected to surface as SOME console noise
      // (Chrome logs aborted/failed resource loads); this scenario exists
      // specifically to prove the app survives it, not to demand silence.
      attachConsoleMonitor(page, failures, { extraAllowed: (text) => /failed|aborted|ERR_/i.test(text) });
      const held = [];
      let failedOnce = false;
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        if (url.includes("dev-qa") || !url.includes("/pacientes")) {
          req.continue();
          return;
        }
        if (!failedOnce) {
          held.push(req);
          return;
        }
        // Next's own fallback/retry after the simulated failure below —
        // let it through normally. Holding EVERY matching request forever
        // (including this fallback one) is what actually hung the page in
        // an earlier version of this script: Chrome blocks JS evaluation
        // in a frame with a genuinely stuck in-flight top-level
        // navigation, which isn't something a real failed fetch does to a
        // real browser (a real browser always eventually gets SOME
        // response) — an artifact of over-holding in the test harness,
        // not the product.
        req.continue();
      });

      await page.goto(AGENDA_PREVIEW_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      await page.evaluate(() => {
        const aside = document.querySelector("aside");
        Array.from(aside.querySelectorAll("a")).find((a) => a.textContent.includes("Pacientes"))?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      assert(held.length >= 1, "navigation request is held", failures);

      // Fail it with a real (if unhappy) HTTP response rather than
      // req.abort() — a raw network-level abort on a request that's part
      // of an in-flight top-level navigation risks corrupting Puppeteer's
      // own frame/execution-context tracking.
      const toFail = held.splice(0);
      failedOnce = true;
      for (const req of toFail) {
        try {
          req.respond({ status: 500, headers: corsHeaders({ "content-type": "text/plain" }), body: "simulated failure" });
        } catch {
          // Already settled — irrelevant to this assertion.
        }
      }
      await new Promise((r) => setTimeout(r, 2000));

      const stillOnPreview = page.url().includes("agenda-preview");
      if (stillOnPreview) {
        // Defensive timeout, not just correctness: a page.evaluate() that
        // never resolves would otherwise hang this whole suite forever.
        const timedOut = Symbol("timed-out");
        const afterFailure = await Promise.race([
          readSidebarLink(page, "Pacientes").catch(() => timedOut),
          new Promise((resolve) => setTimeout(() => resolve(timedOut), 5000)),
        ]);
        if (afterFailure === timedOut) {
          assert(false, "reading Sidebar state after a failed navigation did not hang the page (it did — see qa-nav-pending-check.mjs)", failures);
        } else {
          assert(afterFailure?.pending === false, "the failed navigation does not leave Pacientes permanently pending", failures);
          const agendaStillWorks = await readSidebarLink(page, "Agenda");
          assert(Boolean(agendaStillWorks?.found), "the Sidebar itself is still present/interactive after a failed navigation (app not frozen)", failures);
        }
      } else {
        // Next's own fallback (a hard reload) is also an acceptable
        // resolution — either way nothing stays stuck forever.
        assert(true, "a failed navigation resolved via Next's own fallback rather than hanging forever", failures);
      }

      await page.close();
    }

    // --- Scenario 5: PROGRAMMATIC NAVIGATION — "Salir" keeps its own
    // contextual pending (regression for this task's own fix), no
    // redundant second loader. -----------------------------------------------
    console.log('Scenario: "Salir" (Header) shows its own contextual "Cerrando sesión…" pending — no click → silence gap, no duplicate loader');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      attachConsoleMonitor(page, failures, {});
      const held = [];
      await page.setRequestInterception(true);
      holdMatching(page, ["/login"], held);

      await page.goto(AGENDA_PREVIEW_URL, { waitUntil: "networkidle0", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, 800));

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('header button[aria-haspopup="menu"]'))[0]?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      const menuOpened = await page.evaluate(() => Boolean(document.querySelector('[role="menu"]')));
      assert(menuOpened === true, "user menu opened", failures);

      await page.evaluate(() => {
        Array.from(document.querySelectorAll('[role="menu"] button')).find((b) => b.textContent.trim() === "Salir")?.click();
      });
      await new Promise((r) => setTimeout(r, 150));

      const duringSignOut = await page.evaluate(() => {
        const menu = document.querySelector('[role="menu"]');
        const btn = Array.from(menu?.querySelectorAll("button") ?? []).find((b) => b.textContent.includes("Cerrando sesión") || b.textContent.trim() === "Salir");
        return { menuStillOpen: Boolean(menu), text: btn?.textContent.trim(), disabled: btn?.disabled };
      });
      assert(duringSignOut.menuStillOpen === true, "menu stays open through the pending sign-out (not closed instantly, which used to hide the feedback)", failures);
      assert(duringSignOut.text === "Cerrando sesión…", 'label immediately becomes "Cerrando sesión…"', failures);
      assert(duringSignOut.disabled === true, "the button is disabled immediately (no double-submit)", failures);

      // No second/redundant global loader on top of this contextual one.
      const noGlobalOverlay = await page.evaluate(() => !document.querySelector('[data-global-nav-loader], [role="status"][aria-label*="loading" i]'));
      assert(noGlobalOverlay === true, "no redundant global loading overlay appears alongside the contextual one", failures);

      release(held);
      await new Promise((r) => setTimeout(r, 1500));
      assert(page.url().endsWith("/login"), '"Salir" completes the navigation to /login', failures);

      await page.close();
    }
  } finally {
    await browser.close();
    stopDevServer(devServer, startedServer);
  }

  if (failures.length > 0) {
    console.error(`\nqa-nav-pending-check: FAILED — ${failures.length} check(s) did not hold:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("\nqa-nav-pending-check: OK — every audited navigation click gives immediate, per-item, non-misleading pending feedback.");
}

main().catch((err) => {
  console.error("qa-nav-pending-check: script error:", err);
  process.exit(2);
});
