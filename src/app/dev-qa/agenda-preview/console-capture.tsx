"use client";

// Permanent part of the /dev-qa/agenda-preview regression fixture — patches
// console.error/warn at MODULE TOP LEVEL, before any component renders,
// and records every call into window.__qaConsoleCapture for
// scripts/qa-agenda-console-check.mjs to read via a direct page.evaluate()
// after the page settles.
//
// Why not just Puppeteer's page.on("console")? Investigated and confirmed
// unreliable for this exact case: React's key-warning console.error fires
// synchronously during the very first render, and Puppeteer's CDP
// "Runtime.consoleAPICalled" event relay (and even
// page.evaluateOnNewDocument()-injected patches) can lose messages logged
// in that same narrow window before the listener/injected script is fully
// wired to the new document's execution context.
//
// Rendered as <ConsoleCapture /> (not a bare `import "./console-capture"`
// side-effect import) deliberately: a bare import whose module has no
// consumed export was observed to get bundled away — Next.js/Turbopack
// only reliably keeps a client module whose export is actually referenced
// in JSX. Rendering this as an actual (invisible) component is what
// guarantees the patch is really in the shipped bundle.
if (typeof window !== "undefined") {
  const w = window as unknown as { __qaConsoleCapture?: { type: string; text: string }[] };
  if (!w.__qaConsoleCapture) {
    w.__qaConsoleCapture = [];

    const describe = (value: unknown): string => {
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    (["error", "warn"] as const).forEach((method) => {
      const original = console[method].bind(console);
      console[method] = (...args: unknown[]) => {
        w.__qaConsoleCapture!.push({ type: method, text: args.map(describe).join(" ") });
        original(...args);
      };
    });
  }
}

export function ConsoleCapture() {
  return null;
}
