import type { SupabaseClient } from "@supabase/supabase-js";

// Clinic media for the Patient Portal's clinic profile (/portal/clinica) —
// the "Conoce nuestra clínica" gallery and professional photos, in the
// public `clinic-media` bucket (migration 20260924160000). Server-safe:
// no browser client here (uploads live in clinic-media-actions.ts).

export const CLINIC_MEDIA_BUCKET = "clinic-media";
export const MAX_CLINIC_GALLERY_PHOTOS = 5;
// Mirrors the bucket's own allowed_mime_types / file_size_limit.
export const CLINIC_IMAGE_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const CLINIC_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type ClinicGalleryPhoto = { id: string; storagePath: string; url: string; createdAt: string };

export function validateClinicImage(file: { type: string; size: number }): string | null {
  if (!CLINIC_IMAGE_ACCEPTED_TYPES.includes(file.type)) return "Usa una imagen JPG, PNG o WebP.";
  if (file.size > CLINIC_IMAGE_MAX_BYTES) return "La imagen supera el tamaño máximo de 5 MB.";
  return null;
}

// Paths are always built here (never taken from the client as-is by the
// DB — clinic_gallery_photos' CHECK and set_professional_photo() re-verify
// the clinic folder): <clinicId>/gallery/<uuid>, <clinicId>/professionals/<ppId>.
export function galleryPhotoPath(clinicId: string, id: string): string {
  return `${clinicId}/gallery/${id}`;
}

export function professionalPhotoPath(clinicId: string, professionalProfileId: string): string {
  return `${clinicId}/professionals/${professionalProfileId}`;
}

// ONE fixed object per clinic, overwritten on replace — a replaced cover
// never leaves an orphan. clinics.cover_url's CHECK only accepts this
// clinic's own <clinicId>/cover public URL (migration 20260925100000).
export function clinicCoverPath(clinicId: string): string {
  return `${clinicId}/cover`;
}

// No configured cover → Odentia's own generic dental image, bundled with
// the app (public/). Resolved at render time only — never written to
// clinics.cover_url, never presented as the clinic's own photo. The asset
// has a thin white rounded frame baked in, so callers scale it slightly
// (isFallback) to crop that frame away under object-cover.
export const CLINIC_COVER_FALLBACK_SRC = "/marketplace-background.png";

export function resolveClinicCover(coverUrl: string | null | undefined): { src: string; isFallback: boolean } {
  const url = coverUrl?.trim();
  return url ? { src: url, isFallback: false } : { src: CLINIC_COVER_FALLBACK_SRC, isFallback: true };
}

// "Fotos de la clínica" multi-add (drop or multi-select): validates every
// file BEFORE any upload and keeps only as many valid ones as there are
// free slots (max 5 total, first-come in the order given). Everything else
// is reported, never silently dropped.
export type GalleryUploadPlan = { accepted: File[]; rejected: { name: string; message: string }[]; overflow: number };

export function planGalleryUploads(files: File[], currentCount: number): GalleryUploadPlan {
  const free = Math.max(0, MAX_CLINIC_GALLERY_PHOTOS - currentCount);
  const accepted: File[] = [];
  const rejected: GalleryUploadPlan["rejected"] = [];
  let overflow = 0;
  for (const file of files) {
    const invalid = validateClinicImage(file);
    if (invalid) rejected.push({ name: file.name, message: invalid });
    else if (accepted.length < free) accepted.push(file);
    else overflow += 1;
  }
  return { accepted, rejected, overflow };
}

export function clinicMediaPublicUrl(supabase: SupabaseClient, path: string): string {
  return supabase.storage.from(CLINIC_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Oldest first — a stable, predictable order (no reordering in this MVP).
// RLS scopes it: clinic team, Superadmin, or a Patient linked to THIS clinic.
export async function fetchClinicGalleryPhotos(supabase: SupabaseClient, clinicId: string): Promise<ClinicGalleryPhoto[]> {
  const { data, error } = await supabase
    .from("clinic_gallery_photos")
    .select("id, storage_path, created_at")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: true })
    .limit(MAX_CLINIC_GALLERY_PHOTOS);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    storagePath: row.storage_path,
    url: clinicMediaPublicUrl(supabase, row.storage_path),
    createdAt: row.created_at,
  }));
}
