import { defineConfig } from "vitest/config";
import path from "node:path";

// Minimal config for pure-logic regression tests (no jsdom/browser layer —
// see the tests themselves for why: derivation/date-math functions only,
// no component rendering). Deliberately not next/jest — this project has
// no test runner at all yet, and pulling in Next's own Jest wiring for a
// handful of pure-function tests would be a heavier dependency than the
// tests need.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
