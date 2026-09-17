"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/shell/logo";
import { CheckCircleIcon } from "@/components/shell/icons";
import { INPUT_CLASS } from "@/features/onboarding/field-classes";
import { activatePatientAccessInvitationAction } from "@/features/portal/activate-patient-invitation-action";
import {
  acceptPatientAccessInvitation,
  decidePatientInvitationSessionView,
  previewPatientAccessInvitation,
} from "@/features/portal/patient-invitation-actions";
import { signOutSupabase } from "@/features/session/sign-out";
import { createClient } from "@/lib/supabase/client";

// Accepting a patient_access_invitations token — the Portal's own
// counterpart to /invitacion/[token] (staff, accept_clinic_invitation()).
//
// "Prompt Master — Corregir invitación/acceso de Patient reutilizando el
// patrón de Team Invitations": this page used to reuse AccountStep
// wholesale (name/apellido/correo/contraseña/confirmar), even though the
// Patient this invitation points at already has that identity on file —
// exactly the gap Checkpoint 3 already closed for a Superadmin-issued
// staff invitation (see activatePreProvisionedInvitationAction,
// src/features/clinic/activate-invitation-action.ts). This page now
// follows that SAME pattern: validate the token first
// (previewPatientAccessInvitation(), the anon-callable
// preview_patient_access_invitation() RPC — same "fail fast" shape as
// previewClinicInvitation()), show the Patient's own name/clinic as
// read-only context, and ask a genuinely new account for nothing but a
// password — never a second signup implementation.
//
// Deliberately still simpler than the staff flow in one real way: unlike
// clinic_invitations, patient_access_invitations has no `email` column at
// all (a deliberate QR/link-claim design — see
// accept_patient_access_invitation()'s own migration comment): whoever is
// authenticated when they open this link and click "Vincular mi cuenta"
// is the one who claims it. There is therefore no "wrong-session" state
// here the way the staff page has — decidePatientInvitationSessionView()
// only ever branches on "already authenticated" vs. "not yet, and does
// the Patient even have an email to create an account with."
//
// Deliberately a standalone route, outside PortalShell (a person opening
// this link may have no Odentia account at all yet) and explicitly
// excluded from src/lib/supabase/proxy.ts's own /portal/* gate (see
// PRIVATE_PATIENT_PATHS there) — reachable whether authenticated or not,
// same as /login and the staff invitation page.
const MIN_PASSWORD_LENGTH = 8;

type UsablePreview = {
  firstName: string;
  lastName: string;
  email: string | null;
  clinicName: string | null;
  userExists: boolean;
};

type ViewState =
  | { kind: "validating" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "used" }
  | { kind: "revoked" }
  // The Patient record has no email on file — the ONLY thing this blocks
  // is creating a brand-new account here (there is no email to create it
  // with, and none to invent); logging in with an existing account and
  // claiming the link needs no email at all, so that path stays open via
  // the login link shown here.
  | { kind: "no-email"; preview: UsablePreview }
  | { kind: "need-auth"; preview: UsablePreview }
  | { kind: "existing-user"; preview: UsablePreview }
  | { kind: "ready"; preview: UsablePreview; notice?: string }
  | { kind: "accepting" }
  | { kind: "accepted" }
  | { kind: "error"; message: string };

export default function PatientInvitationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const [view, setView] = useState<ViewState>({ kind: "validating" });
  const [navigatingToPortal, setNavigatingToPortal] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activationErrors, setActivationErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const preview = await previewPatientAccessInvitation(token);
      if (cancelled) return;

      if (!preview.usable) {
        if (preview.status === "expired") setView({ kind: "expired" });
        else if (preview.status === "used") setView({ kind: "used" });
        else if (preview.status === "revoked") setView({ kind: "revoked" });
        else setView({ kind: "invalid" });
        return;
      }

      const usable: UsablePreview = {
        firstName: preview.firstName!,
        lastName: preview.lastName!,
        email: preview.email,
        clinicName: preview.clinicName,
        userExists: preview.userExists,
      };

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      const sessionView = decidePatientInvitationSessionView(Boolean(user), usable.email, usable.userExists);
      setView({ kind: sessionView, preview: usable });
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleActivateAccount = async (preview: UsablePreview) => {
    setActivating(true);
    setActivationError(null);
    const outcome = await activatePatientAccessInvitationAction(token, password);

    if (outcome.status === "error") {
      setActivating(false);
      setActivationError(outcome.message);
      return;
    }
    if (outcome.status === "existing-user") {
      setActivating(false);
      setView({ kind: "existing-user", preview: { ...preview, email: outcome.email, userExists: true } });
      return;
    }

    // Auth account already created + confirmed server-side — this is just
    // the normal public sign-in with the password already sitting in local
    // state (never sent back by the server).
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: outcome.email,
      password,
    });

    if (signInError) {
      // The account exists and is already confirmed — this is only ever a
      // transient failure of the immediate follow-up sign-in, never a
      // reason to call activatePatientAccessInvitationAction() again (it
      // would now correctly report existing-user anyway). A normal login
      // recovers this exact same token/invitation.
      setActivating(false);
      setView({ kind: "existing-user", preview: { ...preview, email: outcome.email, userExists: true } });
      return;
    }

    // Chained auto-accept — reachable ONLY right here, immediately after
    // THIS SAME interaction created a brand-new Auth account and signed it
    // in. Never derived from being authenticated alone: an existing user
    // who merely logs back in always lands on the "ready" view below and
    // accepts manually via handleAccept. "Activar mi cuenta" is one user
    // gesture that both creates access and claims THIS SAME token — accept
    // only ever takes the token; the RPC re-resolves the Patient from the
    // invitation and auth.uid() server-side.
    setActivating(false);
    setView({ kind: "accepting" });
    const acceptOutcome = await acceptPatientAccessInvitation(token);
    if (acceptOutcome.status === "error") {
      // Auth + sign-in succeeded, the link didn't: never retry account
      // creation, never sign out, never fabricate a link. Falls back to
      // the normal authenticated "ready" state so the existing manual
      // "Vincular mi cuenta" button recovers this.
      setView({
        kind: "ready",
        preview,
        notice: "Tu cuenta fue activada, pero no pudimos vincularla todavía. Intenta vincular de nuevo.",
      });
      return;
    }
    setView({ kind: "accepted" });
  };

  const handleActivationSubmit = (e: FormEvent, preview: UsablePreview) => {
    e.preventDefault();
    const errors: typeof activationErrors = {};
    if (!password) {
      errors.password = "Ingresa una contraseña.";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = "Las contraseñas no coinciden.";
    }
    setActivationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    void handleActivateAccount(preview);
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

  const handleWrongAccount = async (preview: UsablePreview) => {
    await signOutSupabase();
    const nextView = decidePatientInvitationSessionView(false, preview.email, preview.userExists);
    setView({ kind: nextView, preview });
  };

  const loginHref = `/login?next=${encodeURIComponent(`/portal/invitacion/${token}`)}`;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 text-center">
          <Link href="/" aria-label="Ir al inicio de Odentia">
            <Logo className="h-12 w-auto" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Activa tu acceso al Portal</h1>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
          {view.kind === "validating" && <p className="text-center text-sm text-muted-foreground">Validando invitación…</p>}

          {view.kind === "invalid" && (
            <div className="text-center">
              <p className="text-sm text-danger">Este enlace de invitación no es válido.</p>
              <Link href="/login" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
                Ir a iniciar sesión
              </Link>
            </div>
          )}

          {view.kind === "expired" && (
            <div className="text-center">
              <p className="text-sm text-danger">Este enlace ya venció. Pide en tu clínica que te generen uno nuevo.</p>
              <Link href="/login" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
                Ir a iniciar sesión
              </Link>
            </div>
          )}

          {view.kind === "used" && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Este enlace de invitación ya fue usado.</p>
              <Link href="/login" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
                Ir a iniciar sesión
              </Link>
            </div>
          )}

          {view.kind === "revoked" && (
            <div className="text-center">
              <p className="text-sm text-danger">Este enlace fue revocado. Pide en tu clínica que te generen uno nuevo.</p>
              <Link href="/login" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
                Ir a iniciar sesión
              </Link>
            </div>
          )}

          {view.kind === "no-email" && (
            <div className="text-center">
              <p className="mb-1 text-sm text-foreground">
                Te invitaron a activar tu acceso a{" "}
                <span className="font-medium">{view.preview.clinicName ?? "tu clínica"}</span> como paciente.
              </p>
              <p className="text-sm text-danger">
                Tu registro de paciente no tiene un correo asociado. Pide en la clínica que lo agreguen para poder
                crear tu acceso.
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                ¿Ya tienes cuenta en Odentia?{" "}
                <Link href={loginHref} className="font-medium text-primary hover:underline">
                  Inicia sesión
                </Link>{" "}
                y vuelve a abrir este mismo enlace para vincularla.
              </p>
            </div>
          )}

          {view.kind === "need-auth" && (
            <>
              <p className="mb-1 text-sm text-foreground">
                Te invitaron a activar tu acceso a{" "}
                <span className="font-medium">{view.preview.clinicName ?? "tu clínica"}</span> en Odentia como
                paciente.
              </p>
              <div className="mb-4 rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="font-medium text-foreground">
                  {view.preview.firstName} {view.preview.lastName}
                </p>
                <p className="text-muted-foreground">{view.preview.email}</p>
              </div>
              <form onSubmit={(e) => handleActivationSubmit(e, view.preview)} noValidate className="flex flex-col gap-3">
                <label htmlFor="activationPassword" className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground/80">Contraseña</span>
                  <input
                    id="activationPassword"
                    type="password"
                    className={INPUT_CLASS}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    disabled={activating}
                  />
                  {activationErrors.password && <span className="text-xs text-danger">{activationErrors.password}</span>}
                </label>
                <label htmlFor="activationConfirmPassword" className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground/80">Confirmar contraseña</span>
                  <input
                    id="activationConfirmPassword"
                    type="password"
                    className={INPUT_CLASS}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    disabled={activating}
                  />
                  {activationErrors.confirmPassword && (
                    <span className="text-xs text-danger">{activationErrors.confirmPassword}</span>
                  )}
                </label>
                {activationError && <p className="text-xs text-danger">{activationError}</p>}
                <button
                  type="submit"
                  disabled={activating}
                  className="mt-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {activating ? "Activando…" : "Activar mi acceso"}
                </button>
              </form>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                ¿Ya tienes cuenta con ese correo?{" "}
                <Link href={loginHref} className="font-medium text-primary hover:underline">
                  Inicia sesión
                </Link>
              </p>
            </>
          )}

          {view.kind === "existing-user" && (
            <div className="text-center">
              <p className="mb-1 text-sm text-foreground">
                Te invitaron a activar tu acceso a{" "}
                <span className="font-medium">{view.preview.clinicName ?? "tu clínica"}</span> en Odentia como
                paciente.
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{view.preview.email}</span> ya tiene una cuenta en
                Odentia. Inicia sesión para vincularla.
              </p>
              <Link
                href={loginHref}
                className="inline-block w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Iniciar sesión para continuar
              </Link>
            </div>
          )}

          {view.kind === "ready" && (
            <div className="text-center">
              <p className="mb-1 text-sm text-foreground">
                Vas a vincular esta cuenta con el registro de{" "}
                <span className="font-medium">
                  {view.preview.firstName} {view.preview.lastName}
                </span>{" "}
                en <span className="font-medium">{view.preview.clinicName ?? "tu clínica"}</span>.
              </p>
              {view.notice && <p className="mt-2 text-xs text-danger">{view.notice}</p>}
              <button
                type="button"
                onClick={handleAccept}
                className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Vincular mi cuenta
              </button>
              <button
                type="button"
                onClick={() => void handleWrongAccount(view.preview)}
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
                disabled={navigatingToPortal}
                aria-busy={navigatingToPortal || undefined}
                onClick={() => {
                  if (navigatingToPortal) return;
                  setNavigatingToPortal(true);
                  router.push("/portal/citas");
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {navigatingToPortal && (
                  <span
                    aria-hidden="true"
                    className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-80 motion-reduce:animate-none"
                  />
                )}
                {navigatingToPortal ? "Entrando a mi Portal…" : "Ir a mi Portal"}
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
