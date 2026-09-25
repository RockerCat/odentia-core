import { createClient } from "@/lib/supabase/client";
import {
  CLINIC_MEDIA_BUCKET,
  clinicCoverPath,
  clinicMediaPublicUrl,
  galleryPhotoPath,
  memberPhotoPath,
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

// Team member photo = profiles.avatar_url (what every surface shows). One
// fixed object per person, overwritten on replace — so a replaced photo
// never leaves an orphan. A version query busts caches; the RPC writes the
// URL after re-checking authorization (clinic_admin of that member's own
// clinic, or Superadmin) and that it's this clinic's own object:
// - professionals: <clinic>/professionals/<ppId> via set_professional_photo();
// - everyone else: <clinic>/members/<membershipId> via set_clinic_member_photo().
export type MemberPhotoTarget = { kind: "professional"; professionalProfileId: string } | { kind: "member"; membershipId: string };

function photoTargetWrite(clinicId: string, target: MemberPhotoTarget) {
  return target.kind === "professional"
    ? {
        path: professionalPhotoPath(clinicId, target.professionalProfileId),
        rpc: "set_professional_photo",
        args: (url: string | null) => ({ p_professional_profile_id: target.professionalProfileId, p_avatar_url: url }),
      }
    : {
        path: memberPhotoPath(clinicId, target.membershipId),
        rpc: "set_clinic_member_photo",
        args: (url: string | null) => ({ p_membership_id: target.membershipId, p_avatar_url: url }),
      };
}

export async function uploadMemberPhoto(clinicId: string, target: MemberPhotoTarget, file: File): Promise<MediaOutcome<string>> {
  const invalid = validateClinicImage(file);
  if (invalid) return { status: "error", message: invalid };
  const supabase = createClient();
  const write = photoTargetWrite(clinicId, target);

  const { error: uploadError } = await supabase.storage
    .from(CLINIC_MEDIA_BUCKET)
    .upload(write.path, file, { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (uploadError) return { status: "error", message: GENERIC_ERROR };

  const url = `${clinicMediaPublicUrl(supabase, write.path)}?v=${Date.now()}`;
  const { error } = await supabase.rpc(write.rpc, write.args(url));
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok", value: url };
}

export async function removeMemberPhoto(clinicId: string, target: MemberPhotoTarget): Promise<MediaOutcome> {
  const supabase = createClient();
  const write = photoTargetWrite(clinicId, target);
  const { error } = await supabase.rpc(write.rpc, write.args(null));
  if (error) return { status: "error", message: "No pudimos quitar la foto. Intenta de nuevo." };
  const { error: removeError } = await supabase.storage.from(CLINIC_MEDIA_BUCKET).remove([write.path]);
  if (removeError) console.error("[clinic-media] member photo object not removed", removeError);
  return { status: "ok", value: undefined };
}

// Clinic cover ("Foto de portada") — same shape as professional photos:
// one fixed object (<clinic>/cover) overwritten on replace, a version query
// to bust caches, then clinics.cover_url (clinics_update_admin RLS + the
// column's own-clinic CHECK). `.select()` turns an RLS-filtered update
// (0 rows — not this clinic's admin) into a visible error.
export async function uploadClinicCover(clinicId: string, file: File): Promise<MediaOutcome<string>> {
  const invalid = validateClinicImage(file);
  if (invalid) return { status: "error", message: invalid };
  const supabase = createClient();
  const path = clinicCoverPath(clinicId);

  const { error: uploadError } = await supabase.storage
    .from(CLINIC_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (uploadError) return { status: "error", message: GENERIC_ERROR };

  const url = `${clinicMediaPublicUrl(supabase, path)}?v=${Date.now()}`;
  const { data, error } = await supabase.from("clinics").update({ cover_url: url }).eq("id", clinicId).select("id");
  if (error || !data || data.length === 0) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok", value: url };
}

// Pointer first (the Portal falls back to the generic asset immediately),
// then the object itself.
export async function removeClinicCover(clinicId: string): Promise<MediaOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.from("clinics").update({ cover_url: null }).eq("id", clinicId).select("id");
  if (error || !data || data.length === 0) return { status: "error", message: "No pudimos quitar la portada. Intenta de nuevo." };
  const { error: removeError } = await supabase.storage.from(CLINIC_MEDIA_BUCKET).remove([clinicCoverPath(clinicId)]);
  if (removeError) console.error("[clinic-media] cover object not removed", removeError);
  return { status: "ok", value: undefined };
}
