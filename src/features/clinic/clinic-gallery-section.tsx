"use client";

import { useState } from "react";
import { ImageIcon, PlusIcon } from "@/components/shell/icons";
import { useToast } from "@/components/toast";
import { deleteClinicGalleryPhoto, uploadClinicGalleryPhoto } from "./clinic-media-actions";
import { MAX_CLINIC_GALLERY_PHOTOS, planGalleryUploads, type ClinicGalleryPhoto } from "./clinic-media-data";
import { ImageDropZone } from "./image-drop-zone";
import { ImageLightbox, ZoomBadge } from "./image-lightbox";

// "Fotos de la clínica" — the real photos patients see under "Conoce nuestra
// clínica" in /portal/clinica. Up to 5, oldest first (no reordering in this
// MVP). Add (picker, multi-select, or dropping files) / delete; the max and
// the clinic scoping are enforced in the DB (clinic_gallery_photos trigger +
// RLS, clinic-media Storage policies) — planGalleryUploads only avoids
// uploading what would be rejected anyway.
export function ClinicGallerySection({ clinicId, initialPhotos }: { clinicId: string; initialPhotos: ClinicGalleryPhoto[] }) {
  const { showToast } = useToast();
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  // Index of the photo open in the viewer, or null.
  const [viewing, setViewing] = useState<number | null>(null);
  const full = photos.length >= MAX_CLINIC_GALLERY_PHOTOS;
  const busy = uploading !== null || deletingId !== null;

  const handleFiles = async (files: File[]) => {
    if (busy) return;
    const plan = planGalleryUploads(files, photos.length);
    const messages = plan.rejected.map((r) => `${r.name}: ${r.message}`);
    if (plan.overflow > 0) {
      messages.push(
        `${plan.overflow === 1 ? "1 foto no se agregó" : `${plan.overflow} fotos no se agregaron`}: la galería admite máximo ${MAX_CLINIC_GALLERY_PHOTOS}.`,
      );
    }
    setErrors(messages);
    if (plan.accepted.length === 0) return;

    // Sequential: keeps the chosen order and lets the DB's max-5 trigger
    // see each insert in turn. A failed file never leaves an orphan
    // (uploadClinicGalleryPhoto removes its object when the row fails).
    setUploading({ done: 0, total: plan.accepted.length });
    let added = 0;
    for (const file of plan.accepted) {
      const outcome = await uploadClinicGalleryPhoto(clinicId, file);
      if (outcome.status === "ok") {
        added += 1;
        setPhotos((prev) => [...prev, outcome.value]);
      } else {
        messages.push(`${file.name}: ${outcome.message}`);
        setErrors([...messages]);
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUploading(null);
    if (added > 0) showToast(added === 1 ? "Foto agregada" : `${added} fotos agregadas`);
  };

  const handleDelete = async (photo: ClinicGalleryPhoto) => {
    if (busy) return;
    setErrors([]);
    setDeletingId(photo.id);
    const outcome = await deleteClinicGalleryPhoto(photo);
    setDeletingId(null);
    if (outcome.status === "error") {
      setErrors([outcome.message]);
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    showToast("Foto eliminada");
  };

  const uploadLabel = uploading ? `Subiendo ${Math.min(uploading.done + 1, uploading.total)}/${uploading.total}…` : "Agregar fotos";

  return (
    <ImageDropZone
      multiple
      disabled={full || busy}
      onFiles={(files) => void handleFiles(files)}
      className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6"
    >
      {(open) => (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Fotos de la clínica</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tus pacientes las ven en el Portal, en “Conoce nuestra clínica”. {photos.length}/{MAX_CLINIC_GALLERY_PHOTOS}
              </p>
            </div>
            <button
              type="button"
              onClick={open}
              disabled={full || busy}
              title={full ? "Ya tienes el máximo de 5 fotos." : undefined}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlusIcon className="size-3.5" />
              {uploadLabel}
            </button>
          </div>

          {errors.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-xs text-danger" role="alert">
              {errors.map((message, i) => (
                <li key={i} className="break-words">
                  {message}
                </li>
              ))}
            </ul>
          )}

          {photos.length > 0 && (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {photos.map((photo, index) => (
                <li key={photo.id} className="flex flex-col gap-1.5">
                  {/* Tap/click to view it large (ImageLightbox); Eliminar stays its own button below. */}
                  <button
                    type="button"
                    onClick={() => setViewing(index)}
                    aria-label={`Ampliar foto ${index + 1} de la clínica`}
                    className="group relative block cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- clinic Storage photo */}
                    <img src={photo.url} alt={`Foto ${index + 1} de la clínica`} className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />
                    <ZoomBadge />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(photo)}
                    disabled={busy}
                    className="self-start py-1 text-xs font-medium text-danger/80 hover:text-danger disabled:opacity-50"
                  >
                    {deletingId === photo.id ? "Eliminando…" : "Eliminar"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* The drop target itself — also a plain button for the picker. */}
          {!full && (
            <button
              type="button"
              onClick={open}
              disabled={busy}
              className="mt-4 flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-6 text-center hover:bg-foreground/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ImageIcon className="size-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground/80">
                <span className="hidden sm:inline">Arrastra fotos aquí o </span>
                <span className="sm:hidden">Toca para </span>
                <span className="text-primary">seleccionar archivos</span>
              </span>
              <span className="text-xs text-muted-foreground">
                JPG, PNG o WebP · máx. 5 MB c/u · te quedan {MAX_CLINIC_GALLERY_PHOTOS - photos.length}
              </span>
            </button>
          )}
          {viewing !== null && photos.length > 0 && (
            <ImageLightbox
              images={photos.map((p, i) => ({ src: p.url, alt: `Foto ${i + 1} de la clínica` }))}
              index={viewing}
              onIndexChange={setViewing}
              onClose={() => setViewing(null)}
            />
          )}
        </>
      )}
    </ImageDropZone>
  );
}
