"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { uploadClinicLogo } from "@/features/clinic/logo";
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
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (clinic: ClinicFormData, location: ClinicLocationData, logoFile: File | null) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const { clinicId, slug } = await provisionClinic(clinic, location);

      // The clinic already exists at this point — a logo upload failure
      // here is never a reason to retry provisioning (that would either
      // fail on the now-taken slug or silently create a second clinic)
      // and never blocks getting to the clinic itself. Requires
      // is_platform_superadmin() widened onto clinics_update_admin/
      // owns_clinic_logo_path() (20260916220000) — provision_clinic()
      // deliberately gives this caller no membership in the clinic she
      // just created.
      if (logoFile) {
        const logoResult = await uploadClinicLogo(clinicId, logoFile);
        if ("failed" in logoResult) {
          console.error("[/platform/clinicas/nueva] uploadClinicLogo failed after provisioning", clinicId);
          showToast("Clínica creada, pero no pudimos subir el logo. Podrás agregarlo después desde la clínica.", "error");
        }
      }

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
        <PlatformClinicForm
          submitting={submitting}
          submitError={error}
          onSubmit={(clinic, location, logoFile) => void handleSubmit(clinic, location, logoFile)}
        />
      </div>
    </div>
  );
}
