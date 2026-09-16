"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { friendlyProvisionError, provisionClinic } from "@/features/platform/api";
import { PlatformClinicForm } from "@/features/platform/clinic-form";
import type { ClinicFormData, ClinicLocationData } from "@/features/onboarding/types";

// Superadmin → Clínicas → Nueva clínica (Ruta B, read-only audit's
// naming). Calls provision_clinic() (see src/features/platform/api.ts)
// through the same real, protected /platform surface — the RPC itself
// validates is_platform_superadmin() internally, so this page is not the
// security boundary, only the UI for it.
export default function NewClinicPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (clinic: ClinicFormData, location: ClinicLocationData) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const { slug } = await provisionClinic(clinic, location);
      router.push(`/platform/clinicas/${slug}`);
    } catch (err) {
      // Technical detail stays out of the UI (friendlyProvisionError below
      // is the only thing rendered) but is still available for diagnosis —
      // never DB internals/PII in what's actually shown.
      console.error("[/platform/clinicas/nueva] provisionClinic failed", err);
      setError(friendlyProvisionError(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Nueva clínica</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crea una clínica directamente. Podrás asignar un Administrador de Clínica y el resto del equipo en un paso
          posterior.
        </p>
      </div>

      {/* max-w-4xl, not -3xl: matches onboarding-wizard.tsx's own widened
          wrapper for this exact three-column layout — a purely visual
          adjustment, needed so Logo | Información básica | Información
          opcional have room to breathe (see clinic-form.tsx). */}
      <div className="max-w-4xl rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8">
        <PlatformClinicForm submitting={submitting} submitError={error} onSubmit={(clinic, location) => void handleSubmit(clinic, location)} />
      </div>
    </div>
  );
}
