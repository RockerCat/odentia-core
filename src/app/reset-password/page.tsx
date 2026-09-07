"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/shell/logo";
import { useToast } from "@/components/toast";
import { updatePassword } from "@/features/session/reset-password";
import { signOutSupabase } from "@/features/session/sign-out";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

type Status = "checking" | "ready" | "invalid";

// The other end of /forgot-password's recovery email — see
// src/features/session/reset-password.ts's own comment on the redirect:
// by the time this client component mounts, src/app/auth/confirm/route.ts
// has already exchanged the recovery link server-side and established a
// real Supabase session via cookies (or the link was invalid/expired and
// no session exists at all). This page never trusts a token of its own —
// it only ever asks "is there currently an authenticated session," exactly
// as Supabase's own documented recovery flow expects
// (resetPasswordForEmail → user clicks link → already-authenticated →
// updateUser({ password })).
export default function ResetPasswordPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setStatus(user ? "ready" : "invalid");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (updating) return;
    setError(null);

    // Same minimum-length/confirm-match rule as Signup's own AccountStep
    // (see src/features/onboarding/account-step.tsx) — never a looser or
    // stricter bar for the same underlying Supabase Auth password policy.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setUpdating(true);
    const outcome = await updatePassword(password);
    if (outcome.status === "error") {
      setUpdating(false);
      setError(outcome.message);
      return;
    }

    // Force a clean re-login under the new password rather than leaving
    // the recovery-flow session live — mirrors "Salir"'s own always-clean-
    // up-then-navigate pattern (see use-shell-logout.ts); a transient
    // sign-out failure never blocks reaching /login, since the password
    // itself has already been updated successfully by this point.
    await signOutSupabase();
    showToast("Contraseña actualizada correctamente");
    router.push("/login");
  };

  if (status === "checking") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
        <div className="w-full max-w-md text-center">
          <Link href="/" aria-label="Ir al inicio de Odentia">
            <Logo className="mx-auto h-12 w-auto" />
          </Link>
          <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
            <p className="text-sm text-foreground">Este enlace de recuperación no es válido o ya expiró.</p>
            <Link
              href="/forgot-password"
              className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            >
              Solicitar un nuevo enlace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 text-center">
          <Link href="/" aria-label="Ir al inicio de Odentia">
            <Logo className="h-12 w-auto" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Crea una nueva contraseña</h1>
          <p className="text-sm text-muted-foreground">Elige una contraseña nueva para tu cuenta.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-background p-5 shadow-sm"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground/80">Nueva contraseña</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="••••••••"
              disabled={updating}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground/80">Confirmar contraseña</span>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
              placeholder="••••••••"
              disabled={updating}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
            />
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            type="submit"
            disabled={updating}
            className="mt-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {updating ? "Actualizando contraseña…" : "Actualizar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
