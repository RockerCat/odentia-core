"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ImageIcon } from "@/components/shell/icons";
import type { ClinicLogo } from "./types";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// Fully optional logo picker for Paso 2's own "Logo" column (see
// clinic-step.tsx) — a preview box plus a couple of text-link-style
// actions, not a dropzone. Local-preview only (see ClinicLogo in types.ts):
// no upload, no persistence. Selection and removal are lifted to
// onboarding-wizard.tsx (same pattern as account/clinic/role) so the logo
// survives Paso 2 → Paso 3 → Atrás. The column heading ("Logo de tu
// clínica") lives in clinic-step.tsx, not here.
export function ClinicLogoPicker({
  logo,
  clinicName,
  onSelect,
  onRemove,
}: {
  logo: ClinicLogo;
  clinicName: string;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const openPicker = () => fileInputRef.current?.click();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("El archivo debe ser PNG, JPG o SVG.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("El logo no puede superar los 2 MB.");
      return;
    }
    setError(null);
    onSelect(file);
  };

  const handleRemove = () => {
    setError(null);
    onRemove();
  };

  const initial = clinicName.trim().charAt(0).toUpperCase();

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface">
        {logo.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, never persisted (see ClinicLogo in types.ts)
          <img src={logo.previewUrl} alt="Logo de la clínica" className="max-h-full max-w-full object-contain" />
        ) : initial ? (
          <span className="text-lg font-medium text-primary">{initial}</span>
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </div>

      {logo.file ? (
        <div className="flex flex-col gap-2">
          <p className="max-w-[9rem] truncate text-xs text-muted-foreground">{logo.file.name}</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={openPicker} className="text-xs font-medium text-primary hover:underline">
              Cambiar
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs font-medium text-muted-foreground hover:text-danger"
            >
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={openPicker}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5"
          >
            Subir logo
          </button>
          <p className="text-xs text-muted-foreground">PNG, JPG o SVG · Máx. 2 MB</p>
          <p className="text-xs text-muted-foreground">Puedes agregarlo después</p>
        </div>
      )}

      {error && <p className="max-w-[9rem] text-xs text-danger">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
