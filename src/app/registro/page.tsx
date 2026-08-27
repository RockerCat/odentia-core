import type { Metadata } from "next";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";

// Public onboarding entry point — no session required (same as /login). A
// visitor with an existing session (fresh, or just re-established via an
// email confirmation link) is handled client-side by OnboardingWizard
// itself — see its reentry check.
export const metadata: Metadata = {
  title: "Crea tu clínica | Odentia",
  description: "Registra tu clínica en Odentia: crea tu cuenta, configura tu espacio y empieza a organizar tu operación.",
  alternates: { canonical: "/registro" },
};

export default function RegistroPage() {
  return <OnboardingWizard />;
}
