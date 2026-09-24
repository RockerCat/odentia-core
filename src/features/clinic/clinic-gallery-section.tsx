"use client";

import { useRef, useState } from "react";
import { PlusIcon } from "@/components/shell/icons";
import { useToast } from "@/components/toast";
import { deleteClinicGalleryPhoto, uploadClinicGalleryPhoto } from "./clinic-media-actions";
import { CLINIC_IMAGE_ACCEPTED_TYPES, MAX_CLINIC_GALLERY_PHOTOS, type ClinicGalleryPhoto } from "./clinic-media-data";

// "Fotos de la clínica" — the real photos patients see under "Conoce nuestra
// clínica" in /portal/clinica. Up to 5, oldest first (no reordering in this
// MVP). Add/delete only; the max and the clinic scoping are enforced in the
// DB (clinic_gallery_photos trigger + RLS, clinic-media Storage policies).
export function ClinicGallerySection({ clinicId, initialPhotos }: { clinicId: string; initialPhotos: ClinicGalleryPhoto[] }) {
  const { showToast } = useToast();
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = photos.length >= MAX_CLINIC_GALLERY_PHOTOS;

  const handleFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    setError(null);
    setUploading(true);
    const outcome = await uploadClinicGalleryPhoto(clinicId, file);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setPhotos((prev) => [...prev, outcome.value]);
    showToast("Foto agregada");
  };

  const handleDelete = async (photo: ClinicGalleryPhoto) => {
    if (deletingId) return;
    setError(null);
    setDeletingId(photo.id);
    const outcome = await deleteClinicGalleryPhoto(photo);
    setDeletingId(null);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    showToast("Foto eliminada");
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Fotos de la clínica</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tus pacientes las ven en el Portal, en “Conoce nuestra clínica”. {photos.length}/{MAX_CLINIC_GALLERY_PHOTOS}
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={full || uploading}
          title={full ? "Ya tienes el máximo de 5 fotos." : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="size-3.5" />
          {uploading ? "Subiendo…" : "Agregar foto"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={CLINIC_IMAGE_ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      {photos.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Aún no hay fotos. Agrega hasta 5 (JPG, PNG o WebP, máx. 5 MB).
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- clinic Storage photo */}
              <img src={photo.url} alt={`Foto ${index + 1} de la clínica`} className="aspect-[4/3] w-full rounded-lg border border-border object-cover" />
              <button
                type="button"
                onClick={() => handleDelete(photo)}
                disabled={deletingId !== null}
                className="self-start text-xs font-medium text-danger/80 hover:text-danger disabled:opacity-50"
              >
                {deletingId === photo.id ? "Eliminando…" : "Eliminar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
