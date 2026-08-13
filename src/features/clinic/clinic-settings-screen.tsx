"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { BuildingIcon } from "@/components/shell/icons";
import { CURRENT_USER } from "@/lib/current-user";

// First step of per-clinic branding (Clinic Admin only — see CLAUDE.md
// Domain Model): general clinic info plus the clinic's own logo. No slug,
// public URL, subdomain, or custom colors yet — those are later steps.
// Mock only: "Cambiar logo" swaps in a locally-picked file via
// URL.createObjectURL (nothing is uploaded/persisted anywhere).
export function ClinicSettingsScreen() {
  const [logoUrl, setLogoUrl] = useState<string | null>(CURRENT_USER.clinicLogoUrl ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChangeClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setLogoUrl(URL.createObjectURL(file));
    e.target.value = "";
  };

  const handleRemoveLogo = () => setLogoUrl(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">Información general</h2>

        <dl className="mt-4 text-sm">
          <div>
            <dt className="text-xs text-label-foreground">Nombre de la clínica</dt>
            <dd className="mt-0.5 font-medium">{CURRENT_USER.clinicName}</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-border pt-6">
          <p className="text-sm font-medium text-foreground">Logo de la clínica</p>
          <p className="text-xs text-muted-foreground">Se muestra en Agenda, junto al nombre de tu clínica.</p>

          {/* Horizontal preview area, not a square avatar-style box — logos
              can be horizontal, square, or vertical, so object-contain
              (never object-cover) always shows the full image, uncropped
              and undistorted, at whatever size fits within these bounds. */}
          <div className="mt-3 flex h-20 w-full items-center justify-center rounded-lg border border-border bg-surface p-3 sm:h-24 sm:w-72">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local mock preview (object URL / static asset), not worth Next/Image's optimization pipeline
              <img src={logoUrl} alt="Logo de la clínica" className="max-h-full max-w-full object-contain" />
            ) : (
              <BuildingIcon className="size-6 text-muted-foreground" />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleChangeClick}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5"
            >
              Cambiar logo
            </button>
            <button
              type="button"
              onClick={handleRemoveLogo}
              disabled={!logoUrl}
              className="text-xs font-medium text-danger/80 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              Eliminar logo
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </div>
        </div>
      </div>
    </div>
  );
}
