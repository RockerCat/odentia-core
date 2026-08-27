import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import type { RestrictedReason } from "@/features/session/restricted-reason";
import { RestrictedAccessSignOut } from "@/features/session/restricted-access-sign-out";

// Reached only via a redirect from src/lib/supabase/proxy.ts or
// src/app/login/page.tsx (?motivo=...) — a real Supabase session whose
// clinic_membership isn't active, or whose clinic is suspended, or (V1, no
// selector UI yet — see CLAUDE.md task scope, section 5) has more than one
// active membership. Never billing/subscription — that's a separate,
// future concern (see task scope, section 13).
const COPY: Record<RestrictedReason, { title: string; body: string }> = {
  suspendida: {
    title: "Tu clínica está suspendida",
    body: "El acceso de tu clínica a Odentia está temporalmente suspendido. Contacta a soporte de Odentia para más información.",
  },
  inactiva: {
    title: "Tu acceso a esta clínica no está activo",
    body: "Tu membresía en esta clínica no está activa. Contacta al administrador de la clínica o a soporte de Odentia.",
  },
  multiple: {
    title: "Perteneces a más de una clínica",
    body: "Por ahora Odentia solo admite una clínica activa por cuenta desde aquí. Estamos trabajando en el selector de clínicas — contáctanos si necesitas acceso antes.",
  },
};

export default async function AccesoRestringidoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const copy = COPY[motivo as RestrictedReason] ?? COPY.inactiva;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-12 w-auto" />

        <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
          <h1 className="text-lg font-semibold text-foreground">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>

          <Link
            href="/"
            className="mt-6 inline-block w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Volver al inicio
          </Link>
          <RestrictedAccessSignOut />
        </div>
      </div>
    </div>
  );
}
