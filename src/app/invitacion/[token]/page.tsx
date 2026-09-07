"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/shell/logo";
import { CheckCircleIcon } from "@/components/shell/icons";
import { acceptClinicInvitation } from "@/features/clinic/team-actions";
import { AccountStep } from "@/features/onboarding/account-step";
import { signUpAccount, type SignUpOutcome } from "@/features/onboarding/api";
import { EmailConfirmationPending } from "@/features/onboarding/email-confirmation-pending";
import { EMPTY_ACCOUNT } from "@/features/onboarding/types";
import { signOutSupabase } from "@/features/session/sign-out";
import { createClient } from "@/lib/supabase/client";

// Accepting a Clínica → Equipo invitation (see invite_clinic_member()/
// accept_clinic_invitation() in the team-invitation-rpcs migration, and
// InviteMemberModal's own comment on why this exists: there's no outbound
// email integration in this project yet, so the admin shares this link
// manually — this page is the other end of that link, and the ONE
// external dependency actually pending for this feature to be fully
// automatic is wiring up real email delivery, e.g. a "Send Invite" email
// through Supabase Auth or a transactional email provider).
//
// Deliberately a standalone route, outside AppShell/PortalShell — the
// person opening this link may not have an Odentia account at all yet.
// Not gated by src/lib/supabase/proxy.ts (not a clinic private path), so
// it's reachable whether authenticated or not, same as /login.
//
// Reuses AccountStep/signUpAccount/EmailConfirmationPending from
// /registro's own wizard as-is (same real Supabase Auth signUp, just
// pointed at this page via signUpAccount's `next` param) rather than a
// second signup implementation.
type ViewState =
  | { kind: "checking" }
  | { kind: "need-auth"; authedEmail: null }
  | { kind: "confirmation-pending"; email: string }
  | { kind: "ready"; authedEmail: string }
  | { kind: "accepting" }
  | { kind: "accepted" }
  | { kind: "error"; message: string };

export default function InvitationPage() {
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
      setView(user?.email ? { kind: "ready", authedEmail: user.email } : { kind: "need-auth", authedEmail: null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignUp = async (data: typeof accountData) => {
    setSigningUp(true);
    setSignUpError(null);
    setAccountData(data);
    const outcome: SignUpOutcome = await signUpAccount(data, `/invitacion/${token}`);
    setSigningUp(false);
    if (outcome.status === "error") {
      setSignUpError(outcome.message);
      return;
    }
    if (outcome.status === "confirmation-required") {
      setView({ kind: "confirmation-pending", email: data.email.trim() });
      return;
    }
    setView({ kind: "ready", authedEmail: data.email.trim() });
  };

  const handleAccept = async () => {
    setView({ kind: "accepting" });
    const outcome = await acceptClinicInvitation(token);
    if (outcome.status === "error") {
      setView({ kind: "error", message: outcome.message });
      return;
    }
    setView({ kind: "accepted" });
  };

  const handleWrongAccount = async () => {
    await signOutSupabase();
    setView({ kind: "need-auth", authedEmail: null });
  };

  // EmailConfirmationPending already renders its own full-page shell
  // (Logo/card) — nesting it inside this page's own shell below would
  // show the Odentia logo twice.
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
          <h1 className="text-xl font-semibold text-foreground">Invitación a un equipo</h1>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
          {view.kind === "checking" && <p className="text-center text-sm text-muted-foreground">Cargando…</p>}

          {view.kind === "need-auth" && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Crea tu cuenta con el correo al que te invitaron para unirte a tu clínica en Odentia.
              </p>
              <AccountStep
                initial={accountData}
                submitting={signingUp}
                submitError={signUpError}
                onContinue={handleSignUp}
              />
              <p className="mt-4 text-center text-xs text-muted-foreground">
                ¿Ya tienes cuenta con ese correo?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Inicia sesión
                </Link>{" "}
                y vuelve a abrir este mismo enlace para aceptar la invitación.
              </p>
            </>
          )}


          {view.kind === "ready" && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Sesión iniciada como <span className="font-medium text-foreground">{view.authedEmail}</span>.
              </p>
              <button
                type="button"
                onClick={handleAccept}
                className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Aceptar invitación
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

          {view.kind === "accepting" && <p className="text-center text-sm text-muted-foreground">Aceptando invitación…</p>}

          {view.kind === "accepted" && (
            <div className="text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircleIcon className="size-6" />
              </span>
              <p className="mt-4 text-sm font-medium text-foreground">¡Listo! Ya eres parte del equipo.</p>
              <button
                type="button"
                onClick={() => router.push("/agenda")}
                className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Ir a mi Agenda
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
