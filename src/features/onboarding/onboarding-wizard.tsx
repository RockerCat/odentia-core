"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/shell/logo";
import { homeRouteForRole } from "@/dev/role"; // DEV TOOL — see src/dev/role.ts
import { writeSession } from "@/features/auth/session";
import { AccountStep } from "./account-step";
import { ClinicStep } from "./clinic-step";
import { ProgressSteps } from "./progress-steps";
import { RoleStep } from "./role-step";
import { SuccessStep } from "./success-step";
import {
  EMPTY_ACCOUNT,
  EMPTY_CLINIC,
  EMPTY_CLINIC_LOGO,
  EMPTY_ROLE,
  type AccountFormData,
  type ClinicFormData,
  type ClinicLogo,
  type OnboardingStep,
  type RoleFormData,
} from "./types";

// /registro — a fully mock, 3-step "create your clinic" onboarding, none of
// it persisted or sent anywhere (see task scope in the prompt this shipped
// from). The only real side effect is the final "Ir a Odentia" CTA, which
// reuses the exact same demo-session mechanism /login already uses
// (writeSession + homeRouteForRole) instead of inventing a second one —
// see src/features/auth/session.ts and src/dev/role-context.tsx.
export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [account, setAccount] = useState<AccountFormData>(EMPTY_ACCOUNT);
  const [clinic, setClinic] = useState<ClinicFormData>(EMPTY_CLINIC);
  const [logo, setLogo] = useState<ClinicLogo>(EMPTY_CLINIC_LOGO);
  const [role, setRole] = useState<RoleFormData>(EMPTY_ROLE);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Object URLs aren't tracked by React state timing, so revocation on
  // unmount needs a ref (a cleanup closure over `logo` would only ever see
  // its value from the render that registered the effect).
  const logoPreviewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    logoPreviewUrlRef.current = logo.previewUrl;
  }, [logo.previewUrl]);
  useEffect(() => {
    // Runs once, on unmount (e.g. router.push after "Ir a Odentia", or
    // navigating away entirely) — see task scope: never leak a preview URL
    // past the wizard's lifetime.
    return () => {
      if (logoPreviewUrlRef.current) URL.revokeObjectURL(logoPreviewUrlRef.current);
    };
  }, []);

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

  const handleAccountContinue = (data: AccountFormData) => {
    setAccount(data);
    setStep(2);
  };

  const handleClinicContinue = (data: ClinicFormData) => {
    setClinic(data);
    setStep(3);
  };

  const handleCreate = (data: RoleFormData) => {
    if (submitting) return;
    setRole(data);
    setSubmitting(true);
    // Simulated creation — no backend call. The brief delay plus the
    // disabled submit button (see role-step.tsx) is what stands in for a
    // real request and prevents a double submit.
    window.setTimeout(() => {
      setSubmitting(false);
      setDone(true);
      // The password's only ever lived in this component's state — drop it
      // the moment the mock flow is done needing it.
      setAccount((prev) => ({ ...prev, password: "", confirmPassword: "" }));
    }, 900);
  };

  const handleEnterDemo = () => {
    const soloDentistClinic = role.workMode === "admin-dentist";
    writeSession({ role: "clinic-admin", soloDentistClinic });
    router.push(homeRouteForRole("clinic-admin"));
  };

  if (done) {
    return <SuccessStep clinicName={clinic.name} logoPreviewUrl={logo.previewUrl} onEnter={handleEnterDemo} />;
  }

  // Paso 2's three-column layout (see clinic-step.tsx) needs more room to
  // breathe than the single-column Paso 1/3 forms — widen just this shared
  // wrapper's cap for that step instead of widening the whole wizard.
  const wrapperMaxWidthClass = step === 2 ? "max-w-4xl" : "max-w-xl";

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
            {step === 1 && <AccountStep initial={account} onContinue={handleAccountContinue} />}
            {step === 2 && (
              <ClinicStep
                initial={clinic}
                logo={logo}
                onContinue={handleClinicContinue}
                onBack={() => setStep(1)}
                onSelectLogo={handleSelectLogo}
                onRemoveLogo={handleRemoveLogo}
              />
            )}
            {step === 3 && (
              <RoleStep
                initial={role}
                submitting={submitting}
                onBack={() => setStep(2)}
                onSubmit={handleCreate}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
