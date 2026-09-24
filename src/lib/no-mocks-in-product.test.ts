import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// "Cero tolerancia a mocks en producto": walks the REAL import graph from
// every product route (src/app, excluding /dev-qa) and fails if a route
// reaches a mock/fixture/dev-identity module it isn't explicitly allowed
// to, or if a reachable product module contains a mock identity string.
// Pilot E2E found "Laura" (mock CURRENT_ASSISTANT) in the real shell, and
// every real form was importing the mock appointment-detail-modal.tsx just
// for a CSS class — this pins both closed.

const SRC = path.resolve(__dirname, "..");

// module (relative to src) → the ONLY product routes allowed to reach it, and why.
const ALLOWED: Record<string, { routes: RegExp; why: string }> = {
  "features/admin/mock-data.ts": { routes: /^app\/admin\//, why: "/admin is the old fully-mock Superadmin UI, unreachable by any real login (role guard)" },
  "features/dashboard/use-authenticated-identity.ts": { routes: /^app\/admin\//, why: "only /admin's own mock greeting" },
  "dev/role.ts": { routes: /.*/, why: "role enum, role labels and nav config every real route uses — no people/records" },
  "features/dashboard/mock-data.ts": { routes: /^app\/admin\//, why: "old mock /admin (see above)" },
  "lib/current-user.ts": { routes: /^app\/admin\//, why: "old mock /admin (see above)" },
  "features/settings/mock-data.ts": { routes: /^app\/configuracion\//, why: "option lists + non-persisted preference defaults (no people/records)" },
  "features/settings/dentist-mock-data.ts": { routes: /^app\/configuracion\//, why: "notification option labels/defaults (no people/records)" },
  "dev/role-context.tsx": { routes: /.*/, why: "session store fed the REAL role by role-bridge.ts; renders nothing" },
  "dev/role-switcher.tsx": { routes: /.*/, why: "renders null outside NODE_ENV=development" },
};

const MOCK_MODULE = /(mock|fixture)|^lib\/current-user\.ts$|use-authenticated-identity|^dev\//;
const MOCK_IDENTITY_STRINGS = [
  "Laura Torres",
  "María Gómez",
  "Mateo Peña",
  "Valeria Muñoz",
  "Clínica Sonrisa Perfecta",
  "randomuser.me",
  "Andrés Bermúdez",
  "sonrisa_perfecta",
];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function runtimeImports(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const re = /(?:import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  const out: string[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1]) continue; // `import type` — no runtime data
    out.push(m[2] ?? m[3] ?? m[4]);
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const rel = (p: string) => path.relative(SRC, p);
const entries = walk(path.join(SRC, "app")).filter(
  (f) => /\/(page|layout|route|template|not-found|error|loading)\.tsx?$/.test(f) && !rel(f).startsWith("app/dev-qa/"),
);

function reachableFrom(entry: string): Set<string> {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const f = queue.shift()!;
    for (const spec of runtimeImports(f)) {
      const r = resolveImport(f, spec);
      if (r && !seen.has(r)) {
        seen.add(r);
        queue.push(r);
      }
    }
  }
  return seen;
}

describe("no mocks in product surfaces", () => {
  it("found the product routes", () => {
    expect(entries.length).toBeGreaterThan(20);
    expect(entries.map(rel)).toContain("app/agenda/page.tsx");
  });

  it("no product route reaches a mock/fixture/dev-identity module outside the documented allowlist", () => {
    const violations: string[] = [];
    for (const entry of entries) {
      for (const mod of reachableFrom(entry)) {
        const m = rel(mod);
        if (!MOCK_MODULE.test(m) || m.includes(".test.")) continue;
        const allowed = ALLOWED[m];
        if (!allowed || !allowed.routes.test(rel(entry))) violations.push(`${rel(entry)} → ${m}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("real staff routes (Agenda, Pacientes, Historia Clínica, atención, RIPS, Clínica) reach no mock module at all", () => {
    for (const route of [
      "app/agenda/page.tsx",
      "app/agenda/atencion/[appointmentId]/page.tsx",
      "app/pacientes/page.tsx",
      "app/pacientes/[id]/historia-clinica/page.tsx",
      "app/rips/page.tsx",
      "app/clinica/page.tsx",
    ]) {
      const mocks = [...reachableFrom(path.join(SRC, route))]
        .map(rel)
        .filter((m) => MOCK_MODULE.test(m) && !["dev/role-context.tsx", "dev/role-switcher.tsx", "dev/role.ts"].includes(m));
      expect({ route, mocks }).toEqual({ route, mocks: [] });
    }
  });

  it("every real Patient Portal route is covered and reaches no mock module at all", () => {
    const portalRoutes = entries.map(rel).filter((r) => r.startsWith("app/portal/"));
    expect(portalRoutes).toEqual(
      expect.arrayContaining([
        "app/portal/citas/page.tsx",
        "app/portal/salud/page.tsx",
        "app/portal/salud/loading.tsx",
        "app/portal/historia/page.tsx",
        "app/portal/clinica/page.tsx",
        "app/portal/perfil/page.tsx",
      ]),
    );
    for (const route of portalRoutes) {
      const mocks = [...reachableFrom(path.join(SRC, route))]
        .map(rel)
        .filter((m) => MOCK_MODULE.test(m) && !["dev/role-context.tsx", "dev/role-switcher.tsx", "dev/role.ts"].includes(m));
      expect({ route, mocks }).toEqual({ route, mocks: [] });
    }
  });

  it("/portal/salud scopes every read by the patient's OWN resolved context — never a URL/prop id", () => {
    const page = fs.readFileSync(path.join(SRC, "app/portal/salud/page.tsx"), "utf8");
    expect(page).toContain("resolvePatientContext(supabase)");
    expect(page).toContain("const clinicId = context.patient.clinicId;");
    expect(page).toContain("const patientId = context.patient.id;");
    expect(page).not.toMatch(/\bparams\b|searchParams/);
  });

  it("no reachable product module (outside the allowlisted mocks) contains a mock identity", () => {
    const hits: string[] = [];
    const all = new Set<string>();
    for (const entry of entries) for (const mod of reachableFrom(entry)) all.add(mod);
    for (const mod of all) {
      const m = rel(mod);
      if (ALLOWED[m] || MOCK_MODULE.test(m)) continue;
      const code = fs
        .readFileSync(mod, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");
      for (const s of MOCK_IDENTITY_STRINGS) if (code.includes(s)) hits.push(`${m}: ${s}`);
    }
    expect(hits).toEqual([]);
  });

  it("the header bell never shows a hardcoded notification count", () => {
    const menu = fs.readFileSync(path.join(SRC, "components/shell/authenticated-user-menu.tsx"), "utf8");
    const bell = menu.slice(menu.indexOf('aria-label="Notificaciones"'), menu.indexOf("</button>", menu.indexOf('aria-label="Notificaciones"')));
    expect(bell).not.toMatch(/>\s*\d+\s*</);
  });
});
