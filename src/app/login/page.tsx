"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/shell/logo";
import { createClient } from "@/lib/supabase/client";
import { bridgeClinicContextIntoMockSession } from "@/features/session/role-bridge";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { restrictedReasonFor } from "@/features/session/restricted-reason";
import { signInWithPassword } from "@/features/session/sign-in";

// Real Supabase Auth login (see src/features/session/sign-in.ts). Right
// after signing in, resolves the user's clinic context (see
// resolve-clinic-context.ts) both to route them correctly — /agenda, or
// /registro if they never finished onboarding, or a safe restricted screen
// for a suspended/inactive/multi-clinic account — and to bridge their real
// membership role into the mock session the rest of the app still reads
// (see role-bridge.ts) until every feature screen moves off mock data.
// src/lib/supabase/proxy.ts also redirects away from here server-side if
// there's already a valid real session.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const outcome = await signInWithPassword(email, password);
    if (outcome.status === "error") {
      setSubmitting(false);
      setError(outcome.message);
      return;
    }

    try {
      const supabase = createClient();
      const context = await resolveClinicContext(supabase);

      if (context.status === "ok") {
        bridgeClinicContextIntoMockSession(context);
        router.push("/agenda");
        return;
      }
      if (context.status === "no-membership") {
        router.push("/registro");
        return;
      }
      if (
        context.status === "membership-inactive" ||
        context.status === "clinic-suspended" ||
        context.status === "multiple-memberships"
      ) {
        router.push(`/acceso-restringido?motivo=${restrictedReasonFor(context.status)}`);
        return;
      }

      setSubmitting(false);
      setError("No pudimos iniciar sesión. Intenta de nuevo en unos minutos.");
    } catch {
      setSubmitting(false);
      setError("No pudimos iniciar sesión. Intenta de nuevo en unos minutos.");
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-4 inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          ← Volver al inicio
        </Link>

        <div className="flex flex-col items-center gap-3 text-center">
          <Link href="/" aria-label="Ir al inicio de Odentia">
            <Logo className="h-12 w-auto" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Bienvenido a Odentia</h1>
          <p className="text-sm text-muted-foreground">Inicia sesión para gestionar tu clínica.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-background p-5 shadow-sm"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground/80">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="tucorreo@clinica.com"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground/80">Contraseña</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="••••••••"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Iniciando sesión…" : "Iniciar sesión"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          ¿Aún no tienes una clínica?{" "}
          <Link href="/registro" className="font-medium text-primary hover:underline">
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
