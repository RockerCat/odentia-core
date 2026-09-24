import { createClient } from "@/lib/supabase/client";
import {
  CLINIC_MEDIA_BUCKET,
  clinicMediaPublicUrl,
  galleryPhotoPath,
  professionalPhotoPath,
  validateClinicImage,
  type ClinicGalleryPhoto,
} from "./clinic-media-data";

// Clinic Admin writes for the clinic profile media. Every write is
// re-authorized server-side (clinic-media Storage policies via
// owns_clinic_logo_path, clinic_gallery_photos RLS + max-5 trigger,
// set_professional_photo()) — the clinic id here only picks the folder.

export type MediaOutcome<T = void> = { status: "ok"; value: T } | { status: "error"; message: string };

const GENERIC_ERROR = "No pudimos guardar la imagen. Intenta de nuevo.";

// Object first, then the row. If the row can't be created (e.g. the
// gallery is already full) the just-uploaded object is removed again, so a
// failed add never leaves an orphan file behind.
export async function uploadClinicGalleryPhoto(clinicId: string, file: File): Promise<MediaOutcome<ClinicGalleryPhoto>> {
  const invalid = validateClinicImage(file);
  if (invalid) return { status: "error", message: invalid };
  const supabase = createClient();
  const id = crypto.randomUUID();
  const path = galleryPhotoPath(clinicId, id);

  const { error: uploadError } = await supabase.storage.from(CLINIC_MEDIA_BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) return { status: "error", message: GENERIC_ERROR };

  const { data, error } = await supabase
    .from("clinic_gallery_photos")
    .insert({ id, clinic_id: clinicId, storage_path: path })
    .select("id, storage_path, created_at")
    .single();
  if (error || !data) {
    await supabase.storage.from(CLINIC_MEDIA_BUCKET).remove([path]);
    if (error?.message.includes("clinic gallery is full")) {
      return { status: "error", message: "La galería ya tiene el máximo de 5 fotos." };
    }
    return { status: "error", message: GENERIC_ERROR };
  }
  return {
    status: "ok",
    value: { id: data.id, storagePath: data.storage_path, url: clinicMediaPublicUrl(supabase, data.storage_path), createdAt: data.created_at },
  };
}

// Row first (it's what the Portal reads), then the file itself. `.select()`
// turns an RLS-filtered delete (0 rows) into a visible error.
export async function deleteClinicGalleryPhoto(photo: Pick<ClinicGalleryPhoto, "id" | "storagePath">): Promise<MediaOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.from("clinic_gallery_photos").delete().eq("id", photo.id).select("id");
  if (error || !data || data.length === 0) return { status: "error", message: "No pudimos eliminar la foto. Intenta de nuevo." };
  const { error: removeError } = await supabase.storage.from(CLINIC_MEDIA_BUCKET).remove([photo.storagePath]);
  if (removeError) console.error("[clinic-media] gallery object not removed", photo.storagePath, removeError);
  return { status: "ok", value: undefined };
}

// One fixed object per professional (<clinic>/professionals/<ppId>),
// overwritten on replace — so a replaced photo never leaves an orphan. A
// version query busts caches; set_professional_photo() writes it to the
// professional's profiles.avatar_url after re-checking authorization.
export async function uploadProfessionalPhoto(clinicId: string, professionalProfileId: string, file: File): Promise<MediaOutcome<string>> {
  const invalid = validateClinicImage(file);
  if (invalid) return { status: "error", message: invalid };
  const supabase = createClient();
  const path = professionalPhotoPath(clinicId, professionalProfileId);

  const { error: uploadError } = await supabase.storage
    .from(CLINIC_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (uploadError) return { status: "error", message: GENERIC_ERROR };

  const url = `${clinicMediaPublicUrl(supabase, path)}?v=${Date.now()}`;
  const { error } = await supabase.rpc("set_professional_photo", { p_professional_profile_id: professionalProfileId, p_avatar_url: url });
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok", value: url };
}

export async function removeProfessionalPhoto(clinicId: string, professionalProfileId: string): Promise<MediaOutcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_professional_photo", { p_professional_profile_id: professionalProfileId, p_avatar_url: null });
  if (error) return { status: "error", message: "No pudimos quitar la foto. Intenta de nuevo." };
  const { error: removeError } = await supabase.storage
    .from(CLINIC_MEDIA_BUCKET)
    .remove([professionalPhotoPath(clinicId, professionalProfileId)]);
  if (removeError) console.error("[clinic-media] professional photo object not removed", removeError);
  return { status: "ok", value: undefined };
}
