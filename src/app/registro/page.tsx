import type { Metadata } from "next";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";

// Public onboarding entry point — no session required (same as /login). A
// visitor with an existing session (fresh, or just re-established via an
// email confirmation link) is handled client-side by OnboardingWizard
// itself — see its reentry check.
//
// Metadata only, updated to stop presenting/indexing this route as
// self-service clinic creation (that commercial promise now lives at
// /demo) — the component/behavior below is untouched. This route stays
// real Auth/reentry infrastructure (account access/activation), not a
// commercial entry point.
export const metadata: Metadata = {
  title: "Accede a tu cuenta | Odentia",
  description: "Accede o activa tu cuenta de Odentia para continuar con tu acceso a la plataforma.",
  alternates: { canonical: "/registro" },
};

export default function RegistroPage() {
  return <OnboardingWizard />;
}
