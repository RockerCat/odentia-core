import Link from "next/link";

// /platform — Checkpoint 3's real Inicio. No dashboard/metrics yet (that
// stays out of scope until a later checkpoint — see PROJECT_STATUS.md):
// a minimal welcome plus a real entry point into the one real
// administrative function that exists so far (Clínicas). Rendered inside
// PlatformShell (see /platform/layout.tsx, the real Superadmin identity
// already shows in its header) — this page itself needs no auth
// resolution of its own.
export default function PlatformPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Platform</h1>
        <p className="mt-1 text-sm text-muted-foreground">Panel de administración de Odentia.</p>
      </div>

      <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Clínicas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulta las clínicas reales registradas en Odentia o crea una nueva directamente.
        </p>
        <Link
          href="/platform/clinicas"
          className="mt-4 inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Ir a Clínicas
        </Link>
      </div>
    </div>
  );
}
