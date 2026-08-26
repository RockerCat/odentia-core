"use client";

import { useState, type FormEvent } from "react";
import { ClinicLogoPicker } from "./clinic-logo-picker";
import { INPUT_CLASS } from "./field-classes";
import type { ClinicFormData, ClinicLogo } from "./types";

// Three-column layout on desktop — Logo | Información básica | Información
// opcional (identidad → datos básicos → datos opcionales) — collapsing to
// Logo above a 2-column row at tablet widths, then a single column on
// mobile. One CSS grid handles all three via source order + col-span,
// rather than three separate cards: Logo spans both columns at `md:`
// (pushing the other two into their own row) and drops back to its own
// column at `lg:`, so no grid-template-areas juggling is needed. Purely a
// layout pass — see clinic-logo-picker.tsx for the (unchanged) logo
// validation/preview logic and onboarding-wizard.tsx for the wider `max-w`
// this step alone gets from its shared wrapper.
const COLUMN_HEADING_CLASS = "text-xs font-semibold tracking-wide text-foreground/70 uppercase";

export function ClinicStep({
  initial,
  logo,
  onContinue,
  onBack,
  onSelectLogo,
  onRemoveLogo,
}: {
  initial: ClinicFormData;
  logo: ClinicLogo;
  onContinue: (data: ClinicFormData) => void;
  onBack: () => void;
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <label htmlFor="clinicCity" className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground/80">Ciudad</span>
                  <input
                    id="clinicCity"
                    className={INPUT_CLASS}
                    value={data.city}
                    onChange={(e) => update({ city: e.target.value })}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label htmlFor="clinicDepartment" className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground/80">Departamento</span>
                  <input
                    id="clinicDepartment"
                    className={INPUT_CLASS}
                    value={data.department}
                    onChange={(e) => update({ department: e.target.value })}
                  />
                </label>
                <label htmlFor="clinicAddress" className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-foreground/80">Dirección</span>
                  <input
                    id="clinicAddress"
                    className={INPUT_CLASS}
                    value={data.address}
                    onChange={(e) => update({ address: e.target.value })}
                  />
                </label>
              </div>

              <p className="-mt-1 text-xs text-muted-foreground">
                Esta será la ubicación principal de tu clínica.
              </p>
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
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-foreground/5"
          >
            Atrás
          </button>
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
