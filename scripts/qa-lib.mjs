// Shared helpers for the scripts/qa-*.mjs browser regression suite (run
// together via `npm run test:browser`). Extracted here once several
// scripts had accumulated near-identical copies of the same dev-server
// bootstrap, fake-clock injection, and slot-picker click helpers — see
// each script's own header comment for what regression it covers.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  process.env.CHROME_PATH,
].filter(Boolean);

export function findChrome() {
  return CHROME_CANDIDATES.find((p) => {
    try {
      return existsSync(p);
    } catch {
      return false;
    }
  });
}

export async function waitForServer(url, timeoutMs) {
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

export async function ensureDevServer() {
  const alreadyUp = await waitForServer("http://localhost:3000", 1000);
  if (alreadyUp) return { devServer: null, startedServer: false };
  const devServer = spawn("npm", ["run", "dev"], { stdio: "ignore", detached: true });
  const up = await waitForServer("http://localhost:3000", 60_000);
  if (!up) {
    if (devServer.pid) process.kill(-devServer.pid);
    throw new Error("dev server never became ready");
  }
  return { devServer, startedServer: true };
}

export function stopDevServer(devServer, startedServer) {
  if (startedServer && devServer && devServer.pid) {
    process.kill(-devServer.pid);
  }
}

export function assert(condition, label, failures) {
  if (condition) {
    console.log(`  ok — ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL — ${label}`);
  }
}

// Pins Date to today's real calendar day at a fixed local hour:minute, for
// every script/navigation this page loads from here on — deterministic
// regardless of when this script actually runs.
export async function installFakeClock(page, hour, minute) {
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

// Same idea, pinned to an absolute ISO instant instead of "today at
// HH:MM" — for fixture rows on a fixed calendar date rather than "today".
export async function installFakeClockAt(page, isoInstant) {
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

// A fake-clocked page's SERVER-rendered HTML is always produced by Node's
// own REAL system clock (Puppeteer's installFakeClock*/evaluateOnNewDocument
// only ever reaches the BROWSER's JS environment — there is no way to skew
// a separate Next.js dev server process's clock from here). Any component
// whose SSR output depends on "now" (e.g. RealAppointmentsBoard's
// isPastSlot-driven disabled/aria-disabled attributes) will then hydrate
// against a DIFFERENT "now" on the client, producing exactly one
// documented, understood React warning — never a real product bug, and
// never seen by an actual user (whose server and browser always share one
// real clock). qa-agenda-console-check.mjs, which never fakes the clock,
// is what actually proves the real app hydrates cleanly; this allowlist
// exists only so fake-clock scripts can still assert on every OTHER
// console message with zero tolerance instead of skipping the check
// entirely.
// Two distinct React messages for the same root cause, depending on how
// far the fake clock skews from the real one: a same-day, hour-only skew
// (installFakeClock) tends to only flip boolean attributes (disabled/
// aria-disabled), logged as a console.error; installFakeClockAt pointing
// at a genuinely different calendar day than the real one (e.g. testing a
// fixture row hardcoded on a fixed future date) can also flip visible TEXT
// (which day is highlighted as "today" in the week strip), which React
// escalates to a thrown hydration error (a pageerror, not a console
// message) instead. Both are handled identically below.
const FAKE_CLOCK_HYDRATION_MISMATCHES = [
  "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.",
  "Hydration failed because the server rendered text didn't match the client.",
];

function isFakeClockHydrationMismatch(text) {
  return FAKE_CLOCK_HYDRATION_MISMATCHES.some((m) => text.includes(m));
}

// RealAppointmentDetailModal always fetches the patient's appointment
// history on mount (fetchAppointmentsForPatient) — a real Supabase call
// this unauthenticated fixture has no session for, so it genuinely 401s
// every time a detail modal opens here. Regex (not substring) and
// deliberately excludes 400 — a 400 would mean a malformed/invalid
// request (e.g. a non-UUID id), a real signal, not this expected noise
// (see fixtures.ts's own comment on why fixture ids are UUID-shaped
// specifically to avoid that).
export function allow401(text) {
  return /^Failed to load resource: the server responded with a status of 40[13] \(\)$/.test(text);
}

// Attaches a console listener that collects every unexpected error/warning
// into `failures` (via the shared assert-style push) as soon as the page
// is created — must be called BEFORE page.goto so nothing logged during
// the very first render is missed. `allowFakeClockHydrationMismatch`
// should only ever be true for a script that actually installs a fake
// clock. `extraAllowed(text)` lets a caller allow additional expected
// noise (e.g. this fixture's unauthenticated 401s) without weakening the
// hydration-mismatch allowlist's own narrow scope.
export function attachConsoleMonitor(page, failures, { allowFakeClockHydrationMismatch = false, extraAllowed = () => false } = {}) {
  page.on("console", (msg) => {
    const type = msg.type();
    if (type !== "error" && type !== "warning") return;
    const text = msg.text();
    if (allowFakeClockHydrationMismatch && isFakeClockHydrationMismatch(text)) return;
    if (extraAllowed(text)) return;
    failures.push(`unexpected console ${type}: ${text.slice(0, 300)}`);
    console.log(`  FAIL — unexpected console ${type}: ${text.slice(0, 300)}`);
  });
  page.on("pageerror", (err) => {
    if (allowFakeClockHydrationMismatch && isFakeClockHydrationMismatch(err.message)) return;
    failures.push(`unhandled page error: ${err.message.slice(0, 300)}`);
    console.log(`  FAIL — unhandled page error: ${err.message.slice(0, 300)}`);
  });
}

export async function navigateDayStripTo(page, dayNum) {
  return page.evaluate((num) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find((b) => {
      const m = /^[A-Za-zÁÉÍÓÚáéíóú]{3}(\d{1,2})$/.exec(b.textContent.trim());
      return m && Number(m[1]) === num && !b.closest(".grid-cols-4");
    });
    if (!btn) return false;
    btn.click();
    return true;
  }, dayNum);
}

export async function clickDayInPicker(page, dayNum) {
  return page.evaluate((num) => {
    const buttons = Array.from(document.querySelectorAll(".grid.grid-cols-4 button"));
    const btn = buttons.find((b) => b.querySelector("span:last-child")?.textContent.trim() === String(num));
    if (!btn) return null;
    btn.click();
    return { text: btn.textContent.trim(), wasDisabled: btn.disabled };
  }, dayNum);
}

export async function dayButtonState(page, dayNum) {
  return page.evaluate((num) => {
    const buttons = Array.from(document.querySelectorAll(".grid.grid-cols-4 button"));
    const btn = buttons.find((b) => b.querySelector("span:last-child")?.textContent.trim() === String(num));
    return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
  }, dayNum);
}
