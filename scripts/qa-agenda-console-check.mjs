#!/usr/bin/env node
// Browser regression: loads the real Agenda render tree (AppShell →
// RealAgendaScreen, via the dev-only src/app/dev-qa/agenda-preview route —
// see that route's own comment for why a real Next.js render is needed
// instead of a Vitest unit test) and fails loudly on ANY unexpected
// console.error/console.warn/uncaught exception.
//
// Why this exists: a prior regression pass tested RealAgendaScreen in
// isolation (never wrapped in the real AppShell — Sidebar/Header/
// MobileHeader/BottomTabBar/RoleSwitcher) and, separately, used ad-hoc
// substring filters like `text.includes("400")` to silence expected noise
// from non-UUID synthetic IDs. Both were real gaps, since fixed.
//
// A THIRD, more fundamental gap was found investigating a real "missing
// key" bug this script kept reporting as clean on a fixture that, it later
// turned out, genuinely reproduced it (exactly one professional + one
// patient — the "Administrador Odontólogo Único" primary use case, see
// fixtures.ts): Puppeteer's `page.on("console")` relays messages via the
// CDP "Runtime.consoleAPICalled" event, and even
// `page.evaluateOnNewDocument()`-injected patches, can both lose output
// logged very early in a fresh navigation — specifically before Chrome's
// script-injection/listener wiring for the new document's execution
// context is fully settled. React's key-warning fires exactly there:
// synchronously during the very first render. Verified directly — an
// `evaluateOnNewDocument`-injected console.error patch captured NOTHING
// on a fixture that a probe compiled into the app's own bundle (same
// technique as src/app/dev-qa/agenda-preview/console-capture.ts below)
// reliably caught every time.
//
// This script therefore does NOT trust `page.on("console")` for its
// pass/fail verdict. The authoritative source is
// window.__qaConsoleCapture, populated by console-capture.ts — a module
// compiled into the fixture page's own bundle, so ES module evaluation
// order guarantees it's patched before any component can render. This
// script reads that array via a single `page.evaluate()` AFTER the page
// settles — a direct, synchronous state read, not an event stream, so
// there's nothing left to race. `page.on("console")` is kept only as a
// logged, non-authoritative cross-check.
//
// Requires Chrome installed locally (puppeteer-core, no bundled browser
// download) and a dev server already reachable, or starts one itself.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const URL = "http://localhost:3000/dev-qa/agenda-preview";
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  process.env.CHROME_PATH,
].filter(Boolean);

// Exact-match only — never a substring test, so a real warning can never
// hide behind a partial match of one of these.
const ALLOWED_EXACT_MESSAGES = new Set([
  // React's own dev-mode banner, not app output.
  "%cDownload the React DevTools for a better development experience: https://react.dev/link/react-devtools font-weight:bold",
  // Turbopack/Next dev server HMR handshake.
  "[HMR] connected",
]);

// This fixture route intentionally has no real Supabase session, so every
// authenticated fetch it makes (patient history, etc.) is REJECTED by the
// real backend — a genuine 401/403, not a bug. Regex, not substring, and
// deliberately excludes 400 (a 400 would mean a malformed/invalid request,
// e.g. a non-UUID id — a real signal, see fixtures.ts's own comment on why
// fixture ids are UUID-shaped specifically to avoid this).
const ALLOWED_PATTERN = /^Failed to load resource: the server responded with a status of 40[13] \(\)$/;

function isAllowed(text) {
  return ALLOWED_EXACT_MESSAGES.has(text) || ALLOWED_PATTERN.test(text);
}

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

async function main() {
  const chromePath = CHROME_CANDIDATES.find((p) => {
    try {
      return existsSync(p);
    } catch {
      return false;
    }
  });
  if (!chromePath) {
    console.error("qa-agenda-console-check: no local Chrome found (checked:", CHROME_CANDIDATES, ") — set CHROME_PATH.");
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
      console.error("qa-agenda-console-check: dev server never became ready.");
      if (devServer.pid) process.kill(-devServer.pid);
      process.exit(2);
    }
  }

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
  const failures = [];
  const crossCheckOnly = [];
  try {
    const page = await browser.newPage();
    page.on("console", (msg) => {
      const type = msg.type();
      if (type !== "error" && type !== "warning") return;
      const text = msg.text();
      if (isAllowed(text)) return;
      crossCheckOnly.push(`[console:${type}] ${text}`);
    });

    await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
    // Give any post-mount effects (week fetch, history fetch) time to
    // settle and report their own console output before we check.
    await new Promise((r) => setTimeout(r, 2000));

    const captured = await page.evaluate(() => window.__qaConsoleCapture ?? null);
    if (captured === null) {
      failures.push("[harness] window.__qaConsoleCapture is undefined — console-capture.ts didn't load; the check itself is broken, not just the app.");
    } else {
      for (const entry of captured) {
        if (isAllowed(entry.text)) continue;
        failures.push(`[${entry.type}] ${entry.text}`);
      }
    }

    // Sanity check the page actually rendered real content, not a blank
    // 404/error page — a false "zero warnings" pass on an empty page would
    // be worse than no check at all.
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (!bodyText.includes("Citas hoy")) {
      failures.push(`[harness] page did not render expected Agenda content (got ${bodyText.length} chars of body text) — the check itself may be broken, not just the app.`);
    }
  } finally {
    await browser.close();
    if (startedServer && devServer && devServer.pid) {
      process.kill(-devServer.pid);
    }
  }

  if (failures.length > 0) {
    console.error(`qa-agenda-console-check: FAILED — ${failures.length} unexpected console message(s)/error(s):\n`);
    for (const f of failures) console.error(" ", f);
    process.exit(1);
  }

  if (crossCheckOnly.length > 0) {
    // The authoritative in-page capture found nothing, but the
    // non-authoritative page.on("console") relay saw something it
    // didn't — surface it for visibility without failing the run on it
    // alone (see header comment on why it's not trusted for verdicts).
    console.log("qa-agenda-console-check: OK (note: page.on('console') cross-check saw extra message(s) the authoritative capture did not — informational only):");
    for (const f of crossCheckOnly) console.log(" ", f);
    return;
  }

  console.log("qa-agenda-console-check: OK — /dev-qa/agenda-preview loaded with zero unexpected console output.");
}

main().catch((err) => {
  console.error("qa-agenda-console-check: script error:", err);
  process.exit(2);
});
