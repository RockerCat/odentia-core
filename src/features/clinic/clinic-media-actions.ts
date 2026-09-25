import { createClient } from "@/lib/supabase/client";
import {
  CLINIC_MEDIA_BUCKET,
  clinicCoverPath,
  clinicMediaPublicUrl,
  galleryPhotoPath,
  profileAvatarPath,
  validateClinicImage,
  type ClinicGalleryPhoto,
} from "./clinic-media-data";

// Clinic media + profile photo writes. Every write is re-authorized
// server-side (clinic-media Storage policies via owns_clinic_logo_path /
// owns_profile_avatar_path, clinic_gallery_photos RLS + max-5 trigger,
// set_my_avatar()/set_clinic_member_avatar()) — ids here only pick paths.

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

// Profile photo = profiles.avatar_url, ONE per user (see profileAvatarPath):
// the same object and field whether the user manages her own photo
// (set_my_avatar — the target is always the session's auth.uid(), never an
// id from here) or her clinic's admin does it from Equipo
// (set_clinic_member_avatar — clinic re-derived from the membership). A
// version query busts caches.
async function uploadAvatar(
  profileId: string,
  file: File,
  save: (url: string) => PromiseLike<{ error: unknown }>,
): Promise<MediaOutcome<string>> {
  const invalid = validateClinicImage(file);
  if (invalid) return { status: "error", message: invalid };
  const supabase = createClient();
  const path = profileAvatarPath(profileId);

  const { error: uploadError } = await supabase.storage
    .from(CLINIC_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (uploadError) return { status: "error", message: GENERIC_ERROR };

  const url = `${clinicMediaPublicUrl(supabase, path)}?v=${Date.now()}`;
  const { error } = await save(url);
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok", value: url };
}

// Pointer first (every surface falls back to initials immediately), then
// the object.
async function removeAvatar(profileId: string, clear: () => PromiseLike<{ error: unknown }>): Promise<MediaOutcome> {
  const { error } = await clear();
  if (error) return { status: "error", message: "No pudimos quitar la foto. Intenta de nuevo." };
  const { error: removeError } = await createClient().storage.from(CLINIC_MEDIA_BUCKET).remove([profileAvatarPath(profileId)]);
  if (removeError) console.error("[clinic-media] avatar object not removed", removeError);
  return { status: "ok", value: undefined };
}

// The folder is the session's own user id — the Storage policy and
// set_my_avatar() both re-check it against auth.uid() server-side.
async function sessionUserId(): Promise<string | null> {
  const { data } = await createClient().auth.getUser();
  return data.user?.id ?? null;
}

export async function uploadMyAvatar(file: File): Promise<MediaOutcome<string>> {
  const invalid = validateClinicImage(file);
  if (invalid) return { status: "error", message: invalid };
  const userId = await sessionUserId();
  if (!userId) return { status: "error", message: GENERIC_ERROR };
  const supabase = createClient();
  return uploadAvatar(userId, file, (url) => supabase.rpc("set_my_avatar", { p_avatar_url: url }));
}

export async function removeMyAvatar(): Promise<MediaOutcome> {
  const userId = await sessionUserId();
  if (!userId) return { status: "error", message: "No pudimos quitar la foto. Intenta de nuevo." };
  const supabase = createClient();
  return removeAvatar(userId, () => supabase.rpc("set_my_avatar", { p_avatar_url: null }));
}

export type AvatarMember = { membershipId: string; profileId: string };

export function uploadMemberAvatar(member: AvatarMember, file: File): Promise<MediaOutcome<string>> {
  const supabase = createClient();
  return uploadAvatar(member.profileId, file, (url) =>
    supabase.rpc("set_clinic_member_avatar", { p_membership_id: member.membershipId, p_avatar_url: url }),
  );
}

export function removeMemberAvatar(member: AvatarMember): Promise<MediaOutcome> {
  const supabase = createClient();
  return removeAvatar(member.profileId, () =>
    supabase.rpc("set_clinic_member_avatar", { p_membership_id: member.membershipId, p_avatar_url: null }),
  );
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
  if (uploadError) {
    // Keep the real cause visible for diagnosis (the UI stays generic).
    console.error("[clinic-media] cover upload failed", uploadError);
    return { status: "error", message: GENERIC_ERROR };
  }

  const url = `${clinicMediaPublicUrl(supabase, path)}?v=${Date.now()}`;
  const { data, error } = await supabase.from("clinics").update({ cover_url: url }).eq("id", clinicId).select("id");
  if (error || !data || data.length === 0) {
    console.error("[clinic-media] cover_url not saved", error ?? "no row updated");
    return { status: "error", message: GENERIC_ERROR };
  }
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
