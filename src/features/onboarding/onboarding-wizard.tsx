"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/shell/logo";
import { createClient } from "@/lib/supabase/client";
import { AccountStep } from "./account-step";
import { AlreadyOnboarded } from "./already-onboarded";
import { bootstrapClinic, findActiveMembership, friendlyBootstrapError, signUpAccount, uploadClinicLogo } from "./api";
import { ClinicStep } from "./clinic-step";
import { EmailConfirmationPending } from "./email-confirmation-pending";
import { ProgressSteps } from "./progress-steps";
import { RoleStep } from "./role-step";
import { SuccessStep } from "./success-step";
import {
  EMPTY_ACCOUNT,
  EMPTY_CLINIC,
  EMPTY_CLINIC_LOCATION,
  EMPTY_CLINIC_LOGO,
  EMPTY_ROLE,
  type AccountFormData,
  type ClinicFormData,
  type ClinicLocationData,
  type ClinicLogo,
  type RoleFormData,
} from "./types";

// /registro — real onboarding: Supabase Auth signup (Paso 1), then
// bootstrap_clinic() + optional Storage logo upload (Paso 3). See api.ts
// for every actual backend call. `phase` is broader than the 3 visible
// steps (see ProgressSteps) — it also covers the async states a real
// backend introduces: checking for an existing session/membership on
// mount, email confirmation pending, and an already-onboarded reentry.
type WizardPhase =
  | "loading"
  | "check-failed"
  | "confirmation-error"
  | "account"
  | "confirmation-pending"
  | "already-onboarded"
  | "clinic"
  | "role"
  | "success";

export function OnboardingWizard() {
  const [phase, setPhase] = useState<WizardPhase>("loading");
  const [account, setAccount] = useState<AccountFormData>(EMPTY_ACCOUNT);
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [clinic, setClinic] = useState<ClinicFormData>(EMPTY_CLINIC);
  const [location, setLocation] = useState<ClinicLocationData>(EMPTY_CLINIC_LOCATION);
  const [logo, setLogo] = useState<ClinicLogo>(EMPTY_CLINIC_LOGO);
  const [role, setRole] = useState<RoleFormData>(EMPTY_ROLE);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ logoUrl: string | null; logoWarning: boolean }>({
    logoUrl: null,
    logoWarning: false,
  });

  // Object URLs aren't tracked by React state timing, so revocation on
  // unmount needs a ref (a cleanup closure over `logo` would only ever see
  // its value from the render that registered the effect).
  const logoPreviewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    logoPreviewUrlRef.current = logo.previewUrl;
  }, [logo.previewUrl]);
  useEffect(() => {
    return () => {
      if (logoPreviewUrlRef.current) URL.revokeObjectURL(logoPreviewUrlRef.current);
    };
  }, []);

  // Reentry check (task scope, section 7): a real session with no active
  // clinic_memberships resumes at Paso 2 instead of redoing Paso 1; a
  // session that already has one refuses to let /registro create a second
  // clinic. Runs client-side (not as a Server Component data fetch)
  // because it must also handle the moment right after an email
  // confirmation link redirect, where the session is only established
  // client-side from the URL fragment. `retryToken` re-runs this effect on
  // demand (see the check-failed screen's "Reintentar" button) instead of
  // exposing the check itself as a callable function reference.
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // /auth/confirm (see route.ts) redirects here with this flag when it
      // couldn't establish a session — invalid code, expired link, or a
      // link already consumed (e.g. an email client's safety prefetch
      // beating the user's own click). Strip it from the URL so a refresh
      // doesn't re-show the error.
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

        if (!session) {
          if (!cancelled) setPhase("account");
          return;
        }

        const { found } = await findActiveMembership();
        if (!cancelled) setPhase(found ? "already-onboarded" : "clinic");
      } catch {
        if (!cancelled) setPhase("check-failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  // Phase already starts at "loading" for the initial mount check; the
  // "Reintentar" button (see the check-failed screen below) is the only
  // place that needs to re-enter it explicitly.
  const handleRetryInitialCheck = () => {
    setPhase("loading");
    setRetryToken((token) => token + 1);
  };

  const handleSelectLogo = (file: File) => {
    setLogo((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  };

  const handleRemoveLogo = () => {
    setLogo((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return EMPTY_CLINIC_LOGO;
    });
  };

  const handleAccountContinue = async (data: AccountFormData) => {
    setAccountSubmitting(true);
    setAccountError(null);
    const outcome = await signUpAccount(data);
    setAccountSubmitting(false);

    if (outcome.status === "error") {
      setAccountError(outcome.message);
      return;
    }

    setAccount({ ...data, password: "", confirmPassword: "" });
    setPhase(outcome.status === "confirmation-required" ? "confirmation-pending" : "clinic");
  };

  const handleClinicContinue = (data: ClinicFormData) => {
    setClinic(data);
    setPhase("role");
  };

  const handleCreate = async (data: RoleFormData) => {
    if (bootstrapping) return;
    setRole(data);
    setBootstrapping(true);
    setBootstrapError(null);

    try {
      const { clinicId } = await bootstrapClinic(clinic, location, data);

      let logoUrl: string | null = null;
      let logoWarning = false;
      if (logo.file) {
        const uploadOutcome = await uploadClinicLogo(clinicId, logo);
        if ("logoUrl" in uploadOutcome) logoUrl = uploadOutcome.logoUrl;
        else logoWarning = true;
      }

      setSuccessInfo({ logoUrl, logoWarning });
      setPhase("success");
    } catch (error) {
      setBootstrapError(friendlyBootstrapError(error));
    } finally {
      setBootstrapping(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
        <Logo className="h-12 w-auto opacity-70" />
      </div>
    );
  }

  if (phase === "check-failed") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
        <div className="w-full max-w-md text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm sm:p-8">
            <h1 className="text-lg font-semibold text-foreground">No pudimos cargar tu registro</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ocurrió un problema al verificar tu cuenta. Intenta de nuevo.
            </p>
            <button
              type="button"
              onClick={handleRetryInitialCheck}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Reintentar
            </button>
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
            <h1 className="text-lg font-semibold text-foreground">No pudimos confirmar tu cuenta</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              El enlace de confirmación no es válido, ya venció o ya fue usado. Intenta crear tu cuenta de nuevo — si
              el correo ya existe, te reenviaremos un enlace nuevo.
            </p>
            <button
              type="button"
              onClick={handleRetryInitialCheck}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Volver a intentar
            </button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              ¿Ya confirmaste antes?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "confirmation-pending") return <EmailConfirmationPending email={account.email} />;
  if (phase === "already-onboarded") return <AlreadyOnboarded onSignedOut={handleRetryInitialCheck} />;
  if (phase === "success") {
    return <SuccessStep clinicName={clinic.name} logoUrl={successInfo.logoUrl} logoWarning={successInfo.logoWarning} />;
  }

  const step = phase === "account" ? 1 : phase === "clinic" ? 2 : 3;
  // Paso 2 (clinic)'s three-column layout (see clinic-step.tsx) needs more
  // room to breathe than the single-column account/role forms — widen
  // just this shared wrapper's cap for that step instead of widening the
  // whole wizard.
  const wrapperMaxWidthClass = phase === "clinic" ? "max-w-4xl" : "max-w-xl";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className={`w-full ${wrapperMaxWidthClass}`}>
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
        </div>

        <div className="mt-6 rounded-xl border border-border bg-background p-5 shadow-sm sm:p-6">
          <ProgressSteps current={step} />

          <div className="mt-6">
            {phase === "account" && (
              <AccountStep
                initial={account}
                submitting={accountSubmitting}
                submitError={accountError}
                onContinue={handleAccountContinue}
              />
            )}
            {phase === "clinic" && (
              <ClinicStep
                initial={clinic}
                location={location}
                logo={logo}
                onContinue={handleClinicContinue}
                onLocationChange={setLocation}
                onSelectLogo={handleSelectLogo}
                onRemoveLogo={handleRemoveLogo}
              />
            )}
            {phase === "role" && (
              <>
                <RoleStep
                  initial={role}
                  submitting={bootstrapping}
                  onBack={() => setPhase("clinic")}
                  onSubmit={handleCreate}
                />
                {bootstrapError && <p className="mt-3 text-center text-xs text-danger">{bootstrapError}</p>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
