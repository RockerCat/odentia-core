import { createClient } from "@/lib/supabase/client";

const LOGO_BUCKET = "clinic-logos";

// Mirrors the clinic-logos Storage bucket's own server-side backstop (see
// the storage migration) — client-side validation is UX, that bucket
// config is the real limit.
export const CLINIC_LOGO_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
export const CLINIC_LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type ClinicLogoUploadOutcome = { logoUrl: string } | { failed: true };

// Shared by /registro (onboarding, right after bootstrap_clinic() returns a
// clinic_id — see onboarding/api.ts's uploadClinicLogo, now a thin wrapper
// around this) and /clinica (changing an existing clinic's logo later —
// see clinic-settings-screen.tsx). Tenant-scoped path (<clinic_id>/logo.<ext>,
// enforced by the clinic_logos_* Storage policies, not just convention)
// plus upsert:true is what makes "first upload" and "change logo" the
// exact same call.
export async function uploadClinicLogo(clinicId: string, file: File): Promise<ClinicLogoUploadOutcome> {
  const supabase = createClient();
  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${clinicId}/logo.${extension}`;

  const { error: uploadError } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (uploadError) return { failed: true };

  const {
    data: { publicUrl },
  } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase.from("clinics").update({ logo_url: publicUrl }).eq("id", clinicId);
  if (updateError) return { failed: true };

  return { logoUrl: publicUrl };
}

// "Quitar logo" (see clinic-settings-screen.tsx) — clears clinics.logo_url
// only. Deliberately does not delete the underlying Storage object (a
// clinic_logos_delete_admin policy exists, but a partial failure between
// the two calls would leave logo_url and Storage disagreeing) — dropping
// the pointer is enough for every real reader (shell, Agenda's
// ClinicIdentityCard) to fall back to its neutral placeholder.
export async function removeClinicLogo(clinicId: string): Promise<{ status: "ok" } | { status: "error" }> {
  const supabase = createClient();
  const { error } = await supabase.from("clinics").update({ logo_url: null }).eq("id", clinicId);
  return error ? { status: "error" } : { status: "ok" };
}
