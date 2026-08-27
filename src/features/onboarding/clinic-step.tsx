"use client";

import { useState, type FormEvent } from "react";
import { ClinicLocationPicker } from "./clinic-location-picker";
import { ClinicLogoPicker } from "./clinic-logo-picker";
import { INPUT_CLASS } from "./field-classes";
import type { ClinicFormData, ClinicLocationData, ClinicLogo } from "./types";

// Three-column layout on desktop — Logo | Información básica | Información
// opcional (identidad → datos básicos → datos opcionales) — collapsing to
// Logo above a 2-column row at tablet widths, then a single column on
// mobile. One CSS grid handles all three via source order + col-span,
// rather than three separate cards: Logo spans both columns at `md:`
// (pushing the other two into their own row) and drops back to its own
// column at `lg:`, so no grid-template-areas juggling is needed. See
// clinic-logo-picker.tsx for logo validation/preview and
// onboarding-wizard.tsx for the wider `max-w` this step alone gets from
// its shared wrapper.
const COLUMN_HEADING_CLASS = "text-xs font-semibold tracking-wide text-foreground/70 uppercase";

export function ClinicStep({
  initial,
  location,
  logo,
  onContinue,
  onBack,
  onLocationChange,
  onSelectLogo,
  onRemoveLogo,
}: {
  initial: ClinicFormData;
  location: ClinicLocationData;
  logo: ClinicLogo;
  onContinue: (data: ClinicFormData) => void;
  // Optional: Paso 1 already created a real Supabase Auth account by the
  // time Paso 2 renders (see account-step.tsx/onboarding-wizard.tsx), so
  // there's nothing to safely "go back" to — omitted when this step is the
  // wizard's actual entry point (fresh signup, or resuming an incomplete
  // onboarding after email confirmation).
  onBack?: () => void;
  // Location, unlike the rest of this step's fields, is lifted straight to
  // onboarding-wizard.tsx and applied immediately on every change (not
  // just on Continue) — see clinic-location-picker.tsx, which needs the
  // committed value to decide which of its own sub-views (search/
  // selected/manual) to show when Paso 2 remounts after Paso 3 → Atrás.
  onLocationChange: (next: ClinicLocationData) => void;
  onSelectLogo: (file: File) => void;
  onRemoveLogo: () => void;
}) {
  const [data, setData] = useState(initial);
  const [nameError, setNameError] = useState<string | null>(null);

  const update = (patch: Partial<ClinicFormData>) => setData((prev) => ({ ...prev, ...patch }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!data.name.trim()) {
      setNameError("Ingresa el nombre de tu clínica.");
      return;
    }
    setNameError(null);
    onContinue(data);
  };

  return (
    <div>
      <h1 className="text-lg font-semibold text-foreground">Cuéntanos sobre tu clínica</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Esta información nos ayudará a preparar tu espacio de trabajo.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-7 md:grid-cols-2 lg:grid-cols-[0.8fr_1.5fr_1fr] lg:divide-x lg:divide-border/60">
          {/* Logo — identidad de la clínica */}
          <div className="md:col-span-2 lg:col-span-1">
            <p className={COLUMN_HEADING_CLASS}>Logo de tu clínica</p>
            <div className="mt-3">
              <ClinicLogoPicker logo={logo} clinicName={data.name} onSelect={onSelectLogo} onRemove={onRemoveLogo} />
            </div>
          </div>

          {/* Información básica */}
          <div className="lg:pl-8">
            <p className={COLUMN_HEADING_CLASS}>Información básica</p>
            <div className="mt-3 flex flex-col gap-4">
              <label htmlFor="clinicName" className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground/80">Nombre de la clínica</span>
                <input
                  id="clinicName"
                  className={INPUT_CLASS}
                  value={data.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
                {nameError && <span className="text-xs text-danger">{nameError}</span>}
              </label>

              <label htmlFor="clinicPhone" className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground/80">Teléfono</span>
                <input
                  id="clinicPhone"
                  className={INPUT_CLASS}
                  value={data.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  autoComplete="tel"
                />
              </label>

              <ClinicLocationPicker location={location} onChange={onLocationChange} />
            </div>
          </div>

          {/* Información opcional */}
          <div className="lg:pl-8">
            <p className={COLUMN_HEADING_CLASS}>Información opcional</p>
            <div className="mt-3 flex flex-col gap-4">
              <label htmlFor="clinicLegalName" className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground/80">Razón social</span>
                <input
                  id="clinicLegalName"
                  className={INPUT_CLASS}
                  value={data.legalName}
                  onChange={(e) => update({ legalName: e.target.value })}
                />
              </label>
              <label htmlFor="clinicTaxId" className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground/80">NIT</span>
                <input
                  id="clinicTaxId"
                  className={INPUT_CLASS}
                  value={data.taxId}
                  onChange={(e) => update({ taxId: e.target.value })}
                />
              </label>
              <label htmlFor="clinicInstitutionalEmail" className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-foreground/80">Email institucional</span>
                <input
                  id="clinicInstitutionalEmail"
                  type="email"
                  className={INPUT_CLASS}
                  value={data.institutionalEmail}
                  onChange={(e) => update({ institutionalEmail: e.target.value })}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-foreground/5"
            >
              Atrás
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Continuar
          </button>
        </div>
      </form>
    </div>
  );
}
