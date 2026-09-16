"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ClinicLocationPicker } from "@/features/onboarding/clinic-location-picker";
import { ClinicLogoPicker } from "@/features/onboarding/clinic-logo-picker";
import { INPUT_CLASS } from "@/features/onboarding/field-classes";
import {
  EMPTY_CLINIC,
  EMPTY_CLINIC_LOCATION,
  EMPTY_CLINIC_LOGO,
  type ClinicFormData,
  type ClinicLocationData,
} from "@/features/onboarding/types";
import { isValidTaxIdLength, sanitizeTaxId } from "./api";

const COLUMN_HEADING_CLASS = "text-xs font-semibold tracking-wide text-foreground/70 uppercase";

// Superadmin creating a clinic FOR a customer — reuses the exact approved
// three-column layout from the onboarding wizard's own ClinicStep
// (src/features/onboarding/clinic-step.tsx: Logo | Información básica +
// Sede principal | Información opcional), never that component verbatim
// — its own copy ("Cuéntanos sobre TU clínica") is self-service-specific;
// this screen's own heading/description (see .../nueva/page.tsx) makes
// clear it is not. Same underlying field shapes (ClinicFormData/
// ClinicLocationData), same NIT validation, same real address/geocoding
// picker (ClinicLocationPicker, already shared with /clinica's own sede
// principal editor), and the same real ClinicLogoPicker (file select/
// preview/type+size validation/remove all genuinely work — reused
// unmodified, see clinic-logo-picker.tsx) — never a second, diverging
// implementation of any of those.
//
// DISCLOSED LIMITATION, not silently decided: the selected logo file is
// NOT uploaded anywhere by this form. In the onboarding wizard, the real
// upload only happens as a step AFTER bootstrap_clinic() returns a real
// clinic_id (see onboarding-wizard.tsx's handleCreate + uploadClinicLogo
// in ../onboarding/api.ts) — wiring that same step here means extending
// /platform/clinicas/nueva/page.tsx's own post-success handling, which
// was explicitly out of scope for this visual-only pass ("no cambies...
// manejo de éxito... redirect post-creación"). The picker stays fully
// interactive purely to match the approved visual layout; onSubmit's own
// signature/payload below are unchanged, and nothing selected here is
// sent anywhere yet. Wiring the real upload is a small, separate,
// explicitly-scoped follow-up once confirmed.
export function PlatformClinicForm({
  submitting,
  submitError,
  onSubmit,
}: {
  submitting: boolean;
  submitError: string | null;
  onSubmit: (clinic: ClinicFormData, location: ClinicLocationData) => void;
}) {
  const [clinic, setClinic] = useState<ClinicFormData>(EMPTY_CLINIC);
  const [location, setLocation] = useState<ClinicLocationData>(EMPTY_CLINIC_LOCATION);
  const [logo, setLogo] = useState(EMPTY_CLINIC_LOGO);
  const [nameError, setNameError] = useState<string | null>(null);
  const [taxIdError, setTaxIdError] = useState<string | null>(null);

  // Same object-URL lifecycle as onboarding-wizard.tsx's own logo state —
  // revoke on replace/remove, and once more on unmount via the ref (a
  // cleanup closure over `logo` would only see its value from the render
  // that registered the effect).
  const logoPreviewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    logoPreviewUrlRef.current = logo.previewUrl;
  }, [logo.previewUrl]);
  useEffect(() => {
    return () => {
      if (logoPreviewUrlRef.current) URL.revokeObjectURL(logoPreviewUrlRef.current);
    };
  }, []);

  const update = (patch: Partial<ClinicFormData>) => setClinic((prev) => ({ ...prev, ...patch }));

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!clinic.name.trim()) {
      setNameError("Ingresa el nombre de la clínica.");
      return;
    }
    setNameError(null);

    // Same bound bootstrap_clinic()/provision_clinic() both enforce via
    // clinics_tax_id_format — checked here first so a bad NIT never even
    // reaches the RPC.
    if (!isValidTaxIdLength(sanitizeTaxId(clinic.taxId))) {
      setTaxIdError("El NIT debe tener entre 4 y 12 dígitos (los puntos y el guion del dígito de verificación se ignoran).");
      return;
    }
    setTaxIdError(null);

    onSubmit(clinic, location);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 gap-x-8 gap-y-7 md:grid-cols-2 lg:grid-cols-[0.8fr_1.5fr_1fr] lg:divide-x lg:divide-border/60">
        {/* Logo — identidad de la clínica */}
        <div className="md:col-span-2 lg:col-span-1">
          <p className={COLUMN_HEADING_CLASS}>Logo de la clínica</p>
          <div className="mt-3">
            <ClinicLogoPicker logo={logo} clinicName={clinic.name} onSelect={handleSelectLogo} onRemove={handleRemoveLogo} />
          </div>
        </div>

        {/* Información básica + Sede principal */}
        <div className="lg:pl-8">
          <p className={COLUMN_HEADING_CLASS}>Información básica</p>
          <div className="mt-3 flex flex-col gap-4">
            <label htmlFor="platformClinicName" className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground/80">Nombre de la clínica</span>
              <input
                id="platformClinicName"
                className={INPUT_CLASS}
                value={clinic.name}
                onChange={(e) => update({ name: e.target.value })}
              />
              {nameError && <span className="text-xs text-danger">{nameError}</span>}
            </label>

            <label htmlFor="platformClinicPhone" className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground/80">Teléfono</span>
              <input
                id="platformClinicPhone"
                className={INPUT_CLASS}
                value={clinic.phone}
                onChange={(e) => update({ phone: e.target.value })}
                autoComplete="tel"
              />
            </label>

            <label htmlFor="platformClinicEmail" className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground/80">Email institucional</span>
              <input
                id="platformClinicEmail"
                type="email"
                className={INPUT_CLASS}
                value={clinic.institutionalEmail}
                onChange={(e) => update({ institutionalEmail: e.target.value })}
              />
            </label>

            <ClinicLocationPicker location={location} onChange={setLocation} />
          </div>
        </div>

        {/* Información opcional */}
        <div className="lg:pl-8">
          <p className={COLUMN_HEADING_CLASS}>Información opcional</p>
          <div className="mt-3 flex flex-col gap-4">
            <label htmlFor="platformClinicLegalName" className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground/80">Razón social</span>
              <input
                id="platformClinicLegalName"
                className={INPUT_CLASS}
                value={clinic.legalName}
                onChange={(e) => update({ legalName: e.target.value })}
              />
            </label>
            <label htmlFor="platformClinicTaxId" className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground/80">NIT</span>
              <input
                id="platformClinicTaxId"
                className={INPUT_CLASS}
                value={clinic.taxId}
                onChange={(e) => update({ taxId: e.target.value })}
              />
              {taxIdError && <span className="text-xs text-danger">{taxIdError}</span>}
            </label>
          </div>
        </div>
      </div>

      {submitError && <p className="mt-6 text-sm text-danger">{submitError}</p>}

      <div className="mt-8 flex justify-end border-t border-border pt-5">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Creando…" : "Crear clínica"}
        </button>
      </div>
    </form>
  );
}
