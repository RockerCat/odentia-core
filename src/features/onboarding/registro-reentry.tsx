"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/shell/logo";
import { hasAnyPatientLink } from "@/features/session/has-patient-link";
import { createClient } from "@/lib/supabase/client";
import { decideRegistroReentry, findActiveMembership } from "./api";

type Phase = "loading" | "check-failed" | "confirmation-error";

// /registro — "Odentia — retirar self-service de /registro y eliminar
// Confirm Signup" (2026-09-21). This route no longer offers public
// self-service clinic creation (no AccountStep/Confirm Signup, no
// ClinicStep/RoleStep, no bootstrap_clinic()) — Odentia's clinic-creation
// model is commercial/provisioned (Superadmin only, see CLAUDE.md's
// Domain Model). /registro survives purely as real Auth/reentry
// infrastructure: several places in this app still hardcode it as a
// fallback destination — resolveSafeNext()'s own default, proxy.ts's
// decideClinicRedirect() "no-membership, not a linked Patient" branch,
// decideAuthenticatedRedirect()'s own fallthrough — and this component is
// what makes landing here always resolve to something real rather than a
// dead end or a resurrected onboarding form.
//
// Every real branch below is a REDIRECT, never a rendered form: a
// genuinely new anonymous visitor, or an authenticated visitor with
// neither an active clinic membership nor Patient access, goes to /demo
// (Odentia's real commercial entry point — Landing → intención comercial
// → prospecto → seguimiento comercial → conversión por Superadmin). An
// authenticated visitor who already has real access is routed to it
// exactly as before (decideRegistroReentry, unchanged precedence:
// membership wins over Patient access).
export function RegistroReentry() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // /auth/confirm (see route.ts) redirects here with this flag when it
      // couldn't establish a session — invalid code, expired link, or a
      // link already consumed. This is NOT signup-specific: the SAME
      // fallback fires for a failed Reset Password recovery link too (see
      // /auth/confirm/route.ts's own catch-all failure branch, which
      // never discriminates by `type`) — Reset Password itself is
      // untouched by this checkpoint, this is only the shared error
      // landing spot. Strip it from the URL so a refresh doesn't re-show
      // the error.
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth_error") === "confirmation_failed") {
        params.delete("auth_error");
        const query = params.toString();
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
        if (!cancelled) setPhase("confirmation-error");
        return;
      }

      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        // Only worth checking membership/patient access once a session
        // actually exists — see decideRegistroReentry's own comment for
        // the full decision this mirrors. hasAnyPatientLink() is the same
        // real patient_user_links-backed source proxy.ts's own
        // decideClinicRedirect already treats as authoritative — never a
        // client-supplied flag.
        const [{ found }, hasPatientAccess] = session
          ? await Promise.all([findActiveMembership(), hasAnyPatientLink(supabase)])
          : ([{ found: false }, false] as const);
        if (cancelled) return;

        const decision = decideRegistroReentry(Boolean(session), found, hasPatientAccess);
        if (decision === "redirect-to-product") {
          router.replace("/agenda");
          return;
        }
        if (decision === "redirect-to-portal") {
          router.replace("/portal/citas");
          return;
        }
        router.replace("/demo");
      } catch {
        if (!cancelled) setPhase("check-failed");
      }
    })();

    return () => {
      cancelled = true;
    };
    // router is stable across renders (Next.js App Router) — safe to
    // include without causing extra re-runs.
  }, [retryToken, router]);

  const handleRetry = () => {
    setPhase("loading");
    setRetryToken((token) => token + 1);
  };

  if (phase === "check-failed") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
        <div className="w-full max-w-md text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
            <h1 className="text-lg font-semibold text-foreground">No pudimos cargar tu cuenta</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ocurrió un problema al verificar tu cuenta. Intenta de nuevo.
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Reintentar
            </button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              ¿Quieres usar Odentia en tu clínica?{" "}
              <Link href="/demo" className="font-medium text-primary hover:underline">
                Solicita una demo
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "confirmation-error") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
        <div className="w-full max-w-md text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
            <h1 className="text-lg font-semibold text-foreground">No pudimos completar el enlace</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              El enlace no es válido, ya venció o ya fue usado.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Ir a iniciar sesión
            </Link>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              ¿Olvidaste tu contraseña?{" "}
              <Link href="/forgot-password" className="font-medium text-primary hover:underline">
                Recupérala aquí
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // A brief, real loading state while the reentry check above resolves —
  // this component always ends in a redirect, so this is the only UI a
  // real visitor ever actually sees here.
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <Logo className="h-12 w-auto opacity-70" />
    </div>
  );
}
