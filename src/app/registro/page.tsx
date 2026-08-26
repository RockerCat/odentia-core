import type { Metadata } from "next";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";

// Public onboarding entry point — no session required (same as /login).
// See src/features/onboarding/onboarding-wizard.tsx for the mock flow.
export const metadata: Metadata = {
  title: "Crea tu clínica | Odentia",
  description: "Registra tu clínica en Odentia: crea tu cuenta, configura tu espacio y empieza a organizar tu operación.",
  alternates: { canonical: "/registro" },
};

export default function RegistroPage() {
  return <OnboardingWizard />;
}
