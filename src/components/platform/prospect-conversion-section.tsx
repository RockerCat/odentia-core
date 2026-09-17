"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { convertCommercialProspectToClinic, friendlyConvertProspectError } from "@/features/commercial-prospects/platform-actions";
import { isEligibleForClinicConversion } from "@/features/commercial-prospects/state-machine";
import { uploadClinicLogo } from "@/features/clinic/logo";
import {
  EMPTY_CLINIC,
  EMPTY_CLINIC_LOCATION,
  type ClinicFormData,
  type ClinicLocationData,
} from "@/features/onboarding/types";
import { PlatformClinicForm } from "@/features/platform/clinic-form";

type ConvertedClinic = { slug: string; name: string } | null;

// "Prospecto ganado → Crear clínica" — a SEPARATE, operational action from
// the commercial status pipeline (see CLAUDE.md's Prospecto Comercial
// section: `won` never implies a clinic already exists). Only ever
// rendered by the detail page when `status === 'won'`. Reuses
// PlatformClinicForm/convert_commercial_prospect_to_clinic() — which
// itself calls provision_clinic() internally — never a second clinic-
// creation implementation. The form itself IS the required intermediate
// confirmation step: clicking "Crear clínica" here only reveals it,
// nothing is persisted until its own submit.
export function ProspectConversionSection({
  prospectId,
  defaultClinicName,
  defaultCity,
  contactName,
  contactEmail,
  contactPhone,
  initialConvertedAt,
  initialConvertedClinicId,
  initialConvertedClinic,
}: {
  prospectId: string;
  defaultClinicName: string;
  defaultCity: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  initialConvertedAt: string | null;
  initialConvertedClinicId: string | null;
  initialConvertedClinic: ConvertedClinic;
}) {
  const { showToast } = useToast();
  const [convertedClinicId, setConvertedClinicId] = useState(initialConvertedClinicId);
  const [convertedClinic, setConvertedClinic] = useState(initialConvertedClinic);
  const [convertedAt, setConvertedAt] = useState(initialConvertedAt);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // This component is only ever rendered for `status === 'won'` (the
  // page's own gate) — the only variable left to check is whether it's
  // already been converted. Same isEligibleForClinicConversion() the
  // rest of this feature uses, never a re-derived local condition. Fails
  // closed on the secondary clinic-name/slug lookup: if a prospect is
  // already converted but that lookup failed, this must never fall
  // through to offering "Crear clínica" again — the real guard against a
  // second conversion is the RPC's own row-locked check regardless, but
  // the UI itself should never invite the attempt.
  if (!isEligibleForClinicConversion("won", convertedClinicId)) {
    if (!convertedClinic) {
      return (
        <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Clínica creada</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Este prospecto ya fue convertido en una clínica, pero no pudimos cargar sus datos. Intenta de nuevo en
            unos minutos.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-success/20 bg-success/5 p-6">
        <h2 className="text-sm font-semibold text-foreground">Clínica creada</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {convertedClinic.name}
          {convertedAt && ` — ${new Date(convertedAt).toLocaleDateString("es-CO")}`}
        </p>
        <Link
          href={`/platform/clinicas/${convertedClinic.slug}`}
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          Ver clínica
        </Link>
      </div>
    );
  }

  const handleSubmit = async (clinic: ClinicFormData, location: ClinicLocationData, logoFile: File | null) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await convertCommercialProspectToClinic(prospectId, clinic, location);

      // The prospect is already linked (converted_clinic_id set) and the
      // clinic already exists at this point — a logo upload failure here
      // must never trigger a second conversion attempt (the RPC would
      // correctly reject it as already-converted anyway) and must never
      // block reaching the "Clínica creada" state below. Requires
      // is_platform_superadmin() widened onto clinics_update_admin/
      // owns_clinic_logo_path() (20260916220000) — the Superadmin has no
      // membership in this brand-new clinic either.
      if (logoFile) {
        const logoResult = await uploadClinicLogo(result.clinicId, logoFile);
        if ("failed" in logoResult) {
          console.error("[ProspectConversionSection] uploadClinicLogo failed after conversion", result.clinicId);
          showToast("Clínica creada, pero no pudimos subir el logo. Podrás agregarlo después desde la clínica.", "error");
        }
      }

      setConvertedClinicId(result.clinicId);
      setConvertedClinic({ slug: result.slug, name: clinic.name.trim() });
      setConvertedAt(new Date().toISOString());
    } catch (err) {
      console.error("[ProspectConversionSection] convertCommercialProspectToClinic failed", err);
      setError(friendlyConvertProspectError(err));
      setSubmitting(false);
    }
  };

  if (!showForm) {
    return (
      <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Crear clínica</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Este prospecto fue ganado. Puedes crear su clínica reutilizando el mismo provisioning de Platform →
          Clínicas.
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Crear clínica
        </button>
      </div>
    );
  }

  const initialClinic: ClinicFormData = { ...EMPTY_CLINIC, name: defaultClinicName };
  const initialLocation: ClinicLocationData = { ...EMPTY_CLINIC_LOCATION, locationCity: defaultCity };

  return (
    <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">Crear clínica</h2>
      <p className="mt-1 text-sm text-muted-foreground">Revisa y completa los datos antes de confirmar.</p>

      {/* Read-only commercial-contact context — never auto-converted into
          a Clinic Admin/Auth user/membership/invitation here (see
          CLAUDE.md). The future Clinic Admin may or may not be this same
          person; that's the existing Platform → Equipo flow's own job,
          once the clinic exists. */}
      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
        <p className="text-[11px] text-label-foreground uppercase">Contacto del prospecto</p>
        <p className="mt-1 text-sm text-foreground">{contactName}</p>
        <p className="text-sm text-muted-foreground">{contactEmail}</p>
        <p className="text-sm text-muted-foreground">{contactPhone}</p>
      </div>

      <div className="mt-5">
        <PlatformClinicForm
          submitting={submitting}
          submitError={error}
          onSubmit={(clinic, location, logoFile) => void handleSubmit(clinic, location, logoFile)}
          initialClinic={initialClinic}
          initialLocation={initialLocation}
        />
      </div>
    </div>
  );
}
