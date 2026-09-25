"use client";

import { useState } from "react";
import { ImageIcon } from "@/components/shell/icons";
import { useToast } from "@/components/toast";
import { removeClinicCover, uploadClinicCover } from "./clinic-media-actions";
import { resolveClinicCover, validateClinicImage } from "./clinic-media-data";
import { ImageDropZone } from "./image-drop-zone";
import { ImageLightbox, ZoomBadge } from "./image-lightbox";

// "Foto de portada" — the ONE cover image behind the clinic's name in the
// Patient Portal (/portal/clinica). Distinct from "Fotos de la clínica".
// Without one, the preview shows the same generic Odentia asset the Portal
// falls back to (resolveClinicCover) — never saved as the clinic's photo.
export function ClinicCoverSection({ clinicId, initialCoverUrl }: { clinicId: string; initialCoverUrl: string | null }) {
  const { showToast } = useToast();
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl);
  const [action, setAction] = useState<"uploading" | "removing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cover = resolveClinicCover(coverUrl);
  const [viewing, setViewing] = useState(false);

  const handleFiles = async (files: File[]) => {
    const file = files[0];
    if (!file || action) return;
    const invalid = validateClinicImage(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setAction("uploading");
    const outcome = await uploadClinicCover(clinicId, file);
    setAction(null);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setCoverUrl(outcome.value);
    showToast("Portada actualizada");
  };

  const handleRemove = async () => {
    if (action) return;
    setError(null);
    setAction("removing");
    const outcome = await removeClinicCover(clinicId);
    setAction(null);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setCoverUrl(null);
    showToast("Portada quitada");
  };

  return (
    <ImageDropZone
      disabled={action !== null}
      onFiles={(files) => void handleFiles(files)}
      className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6"
    >
      {(open) => (
        <>
          <h2 className="text-base font-semibold">Foto de portada</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            La imagen principal de tu clínica en el Portal del paciente. JPG, PNG o WebP, máx. 5 MB. Se recorta para llenar el espacio.
          </p>

          {/* A REAL cover opens large in the viewer ("Cambiar foto" below
              still replaces it); the generic fallback is never "enlarged" —
              clicking it picks a file, as before. */}
          <button
            type="button"
            onClick={cover.isFallback ? open : () => setViewing(true)}
            disabled={action !== null}
            aria-label={cover.isFallback ? "Seleccionar foto de portada" : "Ampliar foto de portada"}
            className={`group relative mt-4 block aspect-[16/9] w-full overflow-hidden rounded-xl border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:aspect-[21/9] lg:aspect-[2/1] disabled:cursor-wait ${
              cover.isFallback ? "" : "cursor-zoom-in"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- clinic Storage photo / bundled fallback */}
            <img src={cover.src} alt="" className={`absolute inset-0 size-full object-cover ${cover.isFallback ? "scale-[1.04]" : ""}`} />
            {cover.isFallback && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/70 px-4 text-center">
                <ImageIcon className="size-6 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground/80">
                  <span className="hidden sm:inline">Arrastra una foto aquí o </span>
                  <span className="sm:hidden">Toca para </span>
                  <span className="text-primary">seleccionar archivo</span>
                </span>
                <span className="text-xs text-muted-foreground">Ahora se muestra la imagen genérica de Odentia.</span>
              </span>
            )}
            {!cover.isFallback && <ZoomBadge />}
            {action === "uploading" && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-medium">Subiendo…</span>
            )}
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={open}
              disabled={action !== null}
              className="min-h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-50"
            >
              {action === "uploading" ? "Subiendo…" : coverUrl ? "Cambiar foto" : "Agregar foto"}
            </button>
            {coverUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={action !== null}
                className="min-h-9 px-1 text-xs font-medium text-danger/80 hover:text-danger disabled:opacity-40"
              >
                {action === "removing" ? "Quitando…" : "Quitar foto"}
              </button>
            )}
          </div>
          {error && (
            <p className="mt-2 text-xs text-danger" role="alert">
              {error}
            </p>
          )}
          {viewing && !cover.isFallback && (
            <ImageLightbox images={[{ src: cover.src, alt: "Foto de portada de la clínica" }]} index={0} onIndexChange={() => {}} onClose={() => setViewing(false)} />
          )}
        </>
      )}
    </ImageDropZone>
  );
}
