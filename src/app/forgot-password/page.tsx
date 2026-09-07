"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/shell/logo";
import { requestPasswordReset } from "@/features/session/reset-password";

// Real Supabase Auth password recovery request — see
// src/features/session/reset-password.ts for the actual
// resetPasswordForEmail() call and why this NEVER reveals whether the
// submitted email has an account: the same neutral message renders on any
// successful send, whether or not the address exists.
//
// Same visual language as /login (logo, card, field/button classes copied
// verbatim, not re-derived) — deliberately not sharing a component with
// it, since Login's own form has a different submit flow and this screen
// must never risk changing that when edited.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const outcome = await requestPasswordReset(email);
    setSubmitting(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setSent(true);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/login"
          className="mb-4 inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          ← Volver a iniciar sesión
        </Link>

        <div className="flex flex-col items-center gap-3 text-center">
          <Link href="/" aria-label="Ir al inicio de Odentia">
            <Logo className="h-12 w-auto" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Recupera tu contraseña</h1>
          <p className="text-sm text-muted-foreground">
            Ingresa tu correo y te enviaremos un enlace para restablecerla.
          </p>
        </div>

        {sent ? (
          <div className="mt-6 rounded-xl border border-border bg-background p-5 text-center shadow-sm">
            <p className="text-sm text-foreground">
              Si existe una cuenta asociada a este correo, recibirás un enlace para restablecer tu contraseña.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
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
                disabled={submitting}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
              />
            </label>

            {error && <p className="text-xs text-danger">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Enviando…" : "Enviar enlace de recuperación"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
