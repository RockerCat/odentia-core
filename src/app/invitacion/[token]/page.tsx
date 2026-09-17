"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/shell/logo";
import { CheckCircleIcon } from "@/components/shell/icons";
import { activatePreProvisionedInvitationAction } from "@/features/clinic/activate-invitation-action";
import {
  acceptClinicInvitation,
  decideInvitationSessionView,
  hasPreProvisionedIdentity,
  previewClinicInvitation,
  type InvitationPreview,
} from "@/features/clinic/team-actions";
import { AccountStep } from "@/features/onboarding/account-step";
import { signUpAccount, type SignUpOutcome } from "@/features/onboarding/api";
import { EmailConfirmationPending } from "@/features/onboarding/email-confirmation-pending";
import { INPUT_CLASS } from "@/features/onboarding/field-classes";
import { EMPTY_ACCOUNT } from "@/features/onboarding/types";
import { signOutSupabase } from "@/features/session/sign-out";
import { createClient } from "@/lib/supabase/client";

// Same rule AccountStep's own local validate() already enforces
// (src/features/onboarding/account-step.tsx) — not exported from there,
// restated here rather than adding a cross-file dependency for one
// constant. Must stay in sync if that file's own policy ever changes.
const MIN_PASSWORD_LENGTH = 8;

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
//
// PROMPT NINJA "Checkpoint 1 — reparar infraestructura común de
// invitaciones": the mount effect now validates the token itself first
// (previewClinicInvitation(), a real, anon-callable RPC — see its own
// migration comment), BEFORE ever checking for a session or offering
// signup. An invalid/expired/accepted/revoked token now stops here,
// immediately, instead of only surfacing after a full signup + email
// confirmation round trip. accept_clinic_invitation() remains the only
// real authority — this preview only improves UX, it never substitutes
// for that RPC's own validation at acceptance time.
type ViewState =
  | { kind: "validating" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "already-accepted" }
  | { kind: "revoked" }
  | { kind: "need-auth"; preview: UsablePreview }
  // Checkpoint 1B — the invited email already has a real Odentia account
  // (preview_clinic_invitation()'s own user_exists, resolved server-side
  // from public.profiles off the token's own invited email — never a
  // client-supplied email). No session yet, but there is nothing to
  // sign up for: never render AccountStep here, only a path to /login.
  | { kind: "existing-user"; preview: UsablePreview }
  | { kind: "confirmation-pending"; email: string; preview: UsablePreview }
  // notice is optional and only ever set by the chained auto-accept
  // failure recovery (see handleActivateAccount) — Auth/sign-in succeeded
  // but accept_clinic_invitation() didn't, so this authenticated user
  // lands here with a visible explanation instead of silently retrying
  // anything. Absent for every other path into "ready" (existing user
  // logging back in, wrong-session recovery).
  | { kind: "ready"; authedEmail: string; preview: UsablePreview; notice?: string }
  // A real, different session than the one the invitation was issued
  // for — detected proactively here, before ever offering "Aceptar",
  // rather than only after a rejected RPC call (accept_clinic_invitation
  // itself still enforces this server-side regardless — see its own
  // errcode 42501 check — this state exists purely so the wrong-session
  // user is never invited to click a button that was always going to
  // fail).
  | { kind: "wrong-session"; authedEmail: string; preview: UsablePreview }
  | { kind: "accepting" }
  | { kind: "accepted" }
  | { kind: "error"; message: string };

type UsablePreview = {
  email: string;
  role: "clinic_admin" | "dentist" | "assistant";
  clinicName: string | null;
  userExists: boolean;
  // Null for every traditional Clinic-Admin-issued dentist/assistant
  // invitation (invite_clinic_member()); all three present, regardless of
  // role, only for a Superadmin-issued Platform invitation
  // (provision_first_clinic_admin_invitation()/provision_clinic_team_member()
  // — see hasPreProvisionedIdentity()).
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

const ROLE_LABEL: Record<UsablePreview["role"], string> = {
  clinic_admin: "Administrador de clínica",
  dentist: "Odontólogo",
  assistant: "Asistente",
};

function toUsablePreview(preview: InvitationPreview): UsablePreview {
  // Only ever called when preview.usable is true, which
  // preview_clinic_invitation() guarantees means status === "pending" —
  // email/role are therefore always present (never null) on that branch;
  // this cast documents that invariant rather than re-deriving it.
  return {
    email: preview.email!,
    role: preview.role!,
    clinicName: preview.clinicName,
    userExists: preview.userExists,
    firstName: preview.firstName,
    lastName: preview.lastName,
    phone: preview.phone,
  };
}

export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const [view, setView] = useState<ViewState>({ kind: "validating" });
  // Purely cosmetic pending flag for "Ir a mi Clínica" — router.push() is
  // fire-and-forget (no promise to await, nothing that throws
  // synchronously for a valid internal route), so this never resets back
  // to false on its own; the component unmounts once /agenda takes over.
  // Same local-pending-useState + guarded onClick + disabled convention
  // already used for other plain router.push buttons (e.g.
  // real-appointment-detail-modal.tsx's "Ver paciente"/"Ver historial
  // completo").
  const [navigatingToClinic, setNavigatingToClinic] = useState(false);
  const [accountData, setAccountData] = useState(EMPTY_ACCOUNT);
  const [signingUp, setSigningUp] = useState(false);
  const [signUpError, setSignUpError] = useState<string | null>(null);
  // Password-only activation — reuses accountData's own
  // password/confirmPassword fields (never its firstName/lastName/email,
  // which stay blank/unused in this branch) and the SAME signingUp/
  // signUpError state AccountStep uses, but calls
  // activatePreProvisionedInvitationAction() (handleActivateAccount
  // below), never signUpAccount()/handleSignUp() — see that action's own
  // comment for why this branch needs a genuinely different mechanism,
  // not just a different payload.
  const [activationErrors, setActivationErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const preview = await previewClinicInvitation(token);
      if (cancelled) return;

      if (!preview.usable) {
        if (preview.status === "expired") setView({ kind: "expired" });
        else if (preview.status === "accepted") setView({ kind: "already-accepted" });
        else if (preview.status === "revoked") setView({ kind: "revoked" });
        else setView({ kind: "invalid" });
        return;
      }

      const usable = toUsablePreview(preview);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      const authedEmail = user?.email ?? null;
      const sessionView = decideInvitationSessionView(authedEmail, usable.email, usable.userExists);
      if (sessionView === "ready" || sessionView === "wrong-session") {
        // authedEmail is guaranteed non-null here — decideInvitationSessionView
        // only ever returns "ready"/"wrong-session" once it already checked
        // authedEmail truthy.
        setView({ kind: sessionView, authedEmail: authedEmail!, preview: usable });
      } else {
        setView({ kind: sessionView, preview: usable });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
    if (view.kind !== "need-auth") return; // narrows preview below; always true here
    if (outcome.status === "confirmation-required") {
      setView({ kind: "confirmation-pending", email: data.email.trim(), preview: view.preview });
      return;
    }
    setView({ kind: "ready", authedEmail: data.email.trim(), preview: view.preview });
  };

  // Password-only activation — deliberately NOT signUpAccount()/
  // handleSignUp() above: that path is a public, anonymous
  // supabase.auth.signUp() and always triggers Confirm Signup email,
  // which this checkpoint's whole point is to skip for a pre-provisioned
  // clinic_admin invitation (see activatePreProvisionedInvitationAction's
  // own comment for why that email adds no real security here). Only
  // `token` and the password just typed are sent to the server — never
  // preview.email/firstName/lastName/phone, which the server re-resolves
  // itself from the invitation and never trusts from the browser.
  const handleActivateAccount = async (preview: UsablePreview) => {
    setSigningUp(true);
    setSignUpError(null);
    const outcome = await activatePreProvisionedInvitationAction(token, accountData.password);

    if (outcome.status === "error") {
      setSigningUp(false);
      setSignUpError(outcome.message);
      return;
    }
    if (outcome.status === "existing-user") {
      setSigningUp(false);
      setView({ kind: "existing-user", preview: { ...preview, email: outcome.email, userExists: true } });
      return;
    }

    // Auth account already created + confirmed server-side — this is
    // just the normal public sign-in with the password already sitting
    // in local state (never sent back by the server). Uses outcome.email
    // (server-resolved), not preview.email, though they're always the
    // same value in practice.
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: outcome.email,
      password: accountData.password,
    });

    if (signInError) {
      // The account exists and is already confirmed — this is only ever
      // a transient failure of the immediate follow-up sign-in, never a
      // reason to call activatePreProvisionedInvitationAction() again
      // (it would now correctly report existing-user anyway). A normal
      // login recovers this exact same token/invitation, with no email
      // step involved at any point. Never auto-accept from here — the
      // session that would accept isn't actually established yet.
      setSigningUp(false);
      setView({ kind: "existing-user", preview: { ...preview, email: outcome.email, userExists: true } });
      return;
    }

    // Chained auto-accept — reachable ONLY right here, immediately after
    // THIS SAME interaction created a brand-new Auth account and signed
    // it in. Never derived from being authenticated, role, profile age,
    // or a query param: an existing user who merely logs back in always
    // lands on the "ready" view below and accepts manually via
    // handleAccept, unchanged. "Activar mi cuenta" is one user gesture
    // that both creates access and accepts THIS SAME token — never a
    // different invitation, never clinic_id/role from an input (accept
    // only ever takes the token; the RPC re-resolves everything else from
    // the invitation row and the session's own email server-side).
    setSigningUp(false);
    setView({ kind: "accepting" });
    const acceptOutcome = await acceptClinicInvitation(token);
    if (acceptOutcome.status === "error") {
      // Auth + sign-in succeeded, membership didn't (failure mode C):
      // never retry createUser, never sign out, never fabricate a
      // membership. Falls back to the normal authenticated "ready" state
      // so the existing manual "Aceptar invitación" button recovers this.
      setView({
        kind: "ready",
        authedEmail: outcome.email,
        preview,
        notice: "Tu cuenta fue activada, pero no pudimos completar la invitación. Intenta aceptar la invitación nuevamente.",
      });
      return;
    }

    setView({ kind: "accepted" });
  };

  const handleActivationSubmit = (e: FormEvent, preview: UsablePreview) => {
    e.preventDefault();
    const errors: typeof activationErrors = {};
    if (!accountData.password) {
      errors.password = "Ingresa una contraseña.";
    } else if (accountData.password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (accountData.confirmPassword !== accountData.password) {
      errors.confirmPassword = "Las contraseñas no coinciden.";
    }
    setActivationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    void handleActivateAccount(preview);
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

  const handleWrongAccount = async (preview: UsablePreview) => {
    await signOutSupabase();
    setView({ kind: "need-auth", preview });
  };

  const loginHref = `/login?next=${encodeURIComponent(`/invitacion/${token}`)}`;

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
              <p className="text-sm text-danger">Esta invitación ya venció. Pide a tu administrador que te envíe una nueva.</p>
              <Link href="/login" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
                Ir a iniciar sesión
              </Link>
            </div>
          )}

          {view.kind === "already-accepted" && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Esta invitación ya fue aceptada.</p>
              <Link href="/login" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
                Ir a iniciar sesión
              </Link>
            </div>
          )}

          {view.kind === "revoked" && (
            <div className="text-center">
              <p className="text-sm text-danger">Esta invitación fue revocada. Pide a tu administrador que te envíe una nueva.</p>
              <Link href="/login" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
                Ir a iniciar sesión
              </Link>
            </div>
          )}

          {view.kind === "need-auth" && hasPreProvisionedIdentity(view.preview) && (
            // Checkpoint 3 — a Superadmin-issued first Clinic Admin
            // invitation: identity/clinic/role come entirely from the
            // invitation, shown as read-only context. The only thing
            // this person creates here is her password.
            <>
              <p className="mb-1 text-sm text-foreground">
                Te invitaron a activar tu acceso a{" "}
                <span className="font-medium">{view.preview.clinicName ?? "una clínica"}</span> en Odentia como{" "}
                <span className="font-medium">{ROLE_LABEL[view.preview.role]}</span>.
              </p>
              <div className="mb-4 rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="font-medium text-foreground">
                  {view.preview.firstName} {view.preview.lastName}
                </p>
                <p className="text-muted-foreground">{view.preview.email}</p>
                {view.preview.phone && <p className="text-muted-foreground">{view.preview.phone}</p>}
              </div>
              <form onSubmit={(e) => handleActivationSubmit(e, view.preview)} noValidate className="flex flex-col gap-3">
                <label htmlFor="activationPassword" className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground/80">Contraseña</span>
                  <input
                    id="activationPassword"
                    type="password"
                    className={INPUT_CLASS}
                    value={accountData.password}
                    onChange={(e) => setAccountData((prev) => ({ ...prev, password: e.target.value }))}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    disabled={signingUp}
                  />
                  {activationErrors.password && <span className="text-xs text-danger">{activationErrors.password}</span>}
                </label>
                <label htmlFor="activationConfirmPassword" className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground/80">Confirmar contraseña</span>
                  <input
                    id="activationConfirmPassword"
                    type="password"
                    className={INPUT_CLASS}
                    value={accountData.confirmPassword}
                    onChange={(e) => setAccountData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    disabled={signingUp}
                  />
                  {activationErrors.confirmPassword && (
                    <span className="text-xs text-danger">{activationErrors.confirmPassword}</span>
                  )}
                </label>
                {signUpError && <p className="text-xs text-danger">{signUpError}</p>}
                <button
                  type="submit"
                  disabled={signingUp}
                  className="mt-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {signingUp ? "Activando…" : "Activar mi cuenta"}
                </button>
              </form>
            </>
          )}

          {view.kind === "need-auth" && !hasPreProvisionedIdentity(view.preview) && (
            <>
              <p className="mb-1 text-sm text-foreground">
                Te invitaron a unirte a{" "}
                <span className="font-medium">{view.preview.clinicName ?? "una clínica"}</span> en Odentia como{" "}
                <span className="font-medium">{ROLE_LABEL[view.preview.role]}</span>.
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                Crea tu cuenta con <span className="font-medium text-foreground">{view.preview.email}</span> para
                continuar.
              </p>
              <AccountStep
                initial={accountData}
                submitting={signingUp}
                submitError={signUpError}
                onContinue={handleSignUp}
              />
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
                Te invitaron a unirte a{" "}
                <span className="font-medium">{view.preview.clinicName ?? "una clínica"}</span> en Odentia como{" "}
                <span className="font-medium">{ROLE_LABEL[view.preview.role]}</span>.
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{view.preview.email}</span> ya tiene una cuenta en
                Odentia. Inicia sesión para continuar.
              </p>
              <Link
                href={loginHref}
                className="inline-block w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Iniciar sesión para continuar
              </Link>
            </div>
          )}

          {view.kind === "wrong-session" && (
            <div className="text-center">
              <p className="text-sm text-foreground">
                Esta invitación es para{" "}
                <span className="font-medium">{view.preview.email}</span>, para unirte a{" "}
                <span className="font-medium">{view.preview.clinicName ?? "una clínica"}</span>.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Tu sesión actual es <span className="font-medium text-foreground">{view.authedEmail}</span>. Cierra
                sesión e inicia sesión con el correo correcto para continuar.
              </p>
              <button
                type="button"
                onClick={() => void handleWrongAccount(view.preview)}
                className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Cerrar sesión y continuar
              </button>
            </div>
          )}

          {view.kind === "ready" && (
            <div className="text-center">
              <p className="mb-1 text-sm text-foreground">
                Invitación a{" "}
                <span className="font-medium">{view.preview.clinicName ?? "una clínica"}</span> como{" "}
                <span className="font-medium">{ROLE_LABEL[view.preview.role]}</span>.
              </p>
              <p className="text-sm text-muted-foreground">
                Sesión iniciada como <span className="font-medium text-foreground">{view.authedEmail}</span>.
              </p>
              {view.notice && <p className="mt-2 text-xs text-danger">{view.notice}</p>}
              <button
                type="button"
                onClick={handleAccept}
                className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Aceptar invitación
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

          {view.kind === "accepting" && <p className="text-center text-sm text-muted-foreground">Aceptando invitación…</p>}

          {view.kind === "accepted" && (
            <div className="text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircleIcon className="size-6" />
              </span>
              <p className="mt-4 text-sm font-medium text-foreground">¡Listo! Ya eres parte del equipo.</p>
              <button
                type="button"
                disabled={navigatingToClinic}
                aria-busy={navigatingToClinic || undefined}
                onClick={() => {
                  if (navigatingToClinic) return;
                  setNavigatingToClinic(true);
                  router.push("/agenda");
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {navigatingToClinic && (
                  <span
                    aria-hidden="true"
                    className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-80 motion-reduce:animate-none"
                  />
                )}
                {navigatingToClinic ? "Entrando a mi Clínica…" : "Ir a mi Clínica"}
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
