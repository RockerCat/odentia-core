"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/shell/logo";
import { CheckCircleIcon } from "@/components/shell/icons";
import { AccountStep } from "@/features/onboarding/account-step";
import { signUpAccount, type SignUpOutcome } from "@/features/onboarding/api";
import { EmailConfirmationPending } from "@/features/onboarding/email-confirmation-pending";
import { EMPTY_ACCOUNT } from "@/features/onboarding/types";
import { acceptPatientAccessInvitation } from "@/features/portal/patient-invitation-actions";
import { signOutSupabase } from "@/features/session/sign-out";
import { createClient } from "@/lib/supabase/client";

// Accepting a patient_access_invitations token — the Portal's own
// counterpart to /invitacion/[token] (staff, accept_clinic_invitation()):
// same shape, same reused AccountStep/signUpAccount/EmailConfirmationPending
// (no second signup implementation), just calling
// accept_patient_access_invitation() and landing on /portal/citas instead
// of /agenda. Deliberately a standalone route, outside PortalShell (a
// person opening this link may have no Odentia account at all yet) and
// explicitly excluded from src/lib/supabase/proxy.ts's own /portal/* gate
// (see PRIVATE_PATIENT_PATHS there) — reachable whether authenticated or
// not, same as /login and the staff invitation page.
//
// Unlike accept_clinic_invitation(), the RPC here has no "wrong email"
// case to handle — patient_access_invitations has no email column at all
// (a deliberate QR/link-claim design, see that RPC's own migration
// comment): whoever is authenticated when they open this link and click
// "Vincular mi cuenta" is the one who claims it, so this flow never shows
// an "authedEmail" confirmation step the way the staff one does.
type ViewState =
  | { kind: "checking" }
  | { kind: "need-auth" }
  | { kind: "confirmation-pending"; email: string }
  | { kind: "ready" }
  | { kind: "accepting" }
  | { kind: "accepted" }
  | { kind: "error"; message: string };

export default function PatientInvitationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const [view, setView] = useState<ViewState>({ kind: "checking" });
  const [accountData, setAccountData] = useState(EMPTY_ACCOUNT);
  const [signingUp, setSigningUp] = useState(false);
  const [signUpError, setSignUpError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setView(user ? { kind: "ready" } : { kind: "need-auth" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignUp = async (data: typeof accountData) => {
    setSigningUp(true);
    setSignUpError(null);
    setAccountData(data);
    const outcome: SignUpOutcome = await signUpAccount(data, `/portal/invitacion/${token}`);
    setSigningUp(false);
    if (outcome.status === "error") {
      setSignUpError(outcome.message);
      return;
    }
    if (outcome.status === "confirmation-required") {
      setView({ kind: "confirmation-pending", email: data.email.trim() });
      return;
    }
    setView({ kind: "ready" });
  };

  const handleAccept = async () => {
    setView({ kind: "accepting" });
    const outcome = await acceptPatientAccessInvitation(token);
    if (outcome.status === "error") {
      setView({ kind: "error", message: outcome.message });
      return;
    }
    setView({ kind: "accepted" });
  };

  const handleWrongAccount = async () => {
    await signOutSupabase();
    setView({ kind: "need-auth" });
  };

  if (view.kind === "confirmation-pending") {
    return <EmailConfirmationPending email={view.email} />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 text-center">
          <Link href="/" aria-label="Ir al inicio de Odentia">
            <Logo className="h-12 w-auto" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Vincula tu cuenta como paciente</h1>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
          {view.kind === "checking" && <p className="text-center text-sm text-muted-foreground">Cargando…</p>}

          {view.kind === "need-auth" && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Crea tu cuenta para vincularla a tu historial en la clínica.
              </p>
              <AccountStep
                initial={accountData}
                submitting={signingUp}
                submitError={signUpError}
                onContinue={handleSignUp}
              />
              <p className="mt-4 text-center text-xs text-muted-foreground">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Inicia sesión
                </Link>{" "}
                y vuelve a abrir este mismo enlace para vincularla.
              </p>
            </>
          )}

          {view.kind === "ready" && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Sesión iniciada.</p>
              <button
                type="button"
                onClick={handleAccept}
                className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Vincular mi cuenta
              </button>
              <button
                type="button"
                onClick={handleWrongAccount}
                className="mt-3 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                ¿No eres tú? Cerrar sesión
              </button>
            </div>
          )}

          {view.kind === "accepting" && <p className="text-center text-sm text-muted-foreground">Vinculando tu cuenta…</p>}

          {view.kind === "accepted" && (
            <div className="text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircleIcon className="size-6" />
              </span>
              <p className="mt-4 text-sm font-medium text-foreground">¡Listo! Tu cuenta ya está vinculada.</p>
              <button
                type="button"
                onClick={() => router.push("/portal/citas")}
                className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Ir a mi Portal
              </button>
            </div>
          )}

          {view.kind === "error" && (
            <div className="text-center">
              <p className="text-sm text-danger">{view.message}</p>
              <Link href="/login" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
                Ir a iniciar sesión
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
