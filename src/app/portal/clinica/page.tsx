import { PortalShell } from "@/components/shell/portal-shell";
import { fetchPrimaryLocation, type PrimaryLocation } from "@/features/clinic/data";
import { fetchClinicGalleryPhotos, type ClinicGalleryPhoto } from "@/features/clinic/clinic-media-data";
import { MyClinicScreen, type Loaded } from "@/features/portal/my-clinic-screen";
import { fetchMyClinicProfessionals, type PortalProfessional } from "@/features/portal/requests-data";
import { resolvePatientContext } from "@/features/session/resolve-patient-context";
import type { PatientClinic } from "@/features/session/types";
import { createClient } from "@/lib/supabase/server";

// Real clinic identity/contact — nombre/teléfono come straight from
// resolvePatientContext()'s own context.clinic (already scoped through
// patient_user_links, never a client-supplied clinic_id — see that
// resolver's own comment), and dirección from fetchPrimaryLocation(),
// the SAME real fetcher Clínica staff already uses — no second data
// source. clinic_locations_select_own_via_patient_link (see that
// migration) is what makes this readable for a real Patient at all;
// staff's own access is untouched. MyClinicScreen renders an honest empty
// state for whatever isn't there (no primary sede, incomplete address,
// no phone) — never a demo fallback.
export default async function PortalClinicPage() {
  const supabase = await createClient();

  let clinic: PatientClinic | null = null;
  try {
    const context = await resolvePatientContext(supabase);
    if (context.status === "ok") clinic = context.clinic;
  } catch (error) {
    console.error("[/portal/clinica] failed to load real clinic", error);
  }

  let location: PrimaryLocation | null = null;
  if (clinic) {
    try {
      location = await fetchPrimaryLocation(supabase, clinic.id);
    } catch (error) {
      console.error("[/portal/clinica] fetchPrimaryLocation failed", error);
    }
  }

  // Gallery: clinic_gallery_photos RLS returns only THIS patient's own
  // clinic's rows. Team: get_my_clinic_professionals() — active clinical
  // professionals of her own clinic only (no assistants/admin-only users).
  let gallery: Loaded<ClinicGalleryPhoto[]> = { status: "ok", value: [] };
  let professionals: Loaded<PortalProfessional[]> = { status: "ok", value: [] };
  if (clinic) {
    const clinicId = clinic.id;
    [gallery, professionals] = await Promise.all([
      fetchClinicGalleryPhotos(supabase, clinicId).then(
        (value): Loaded<ClinicGalleryPhoto[]> => ({ status: "ok", value }),
        (error): Loaded<ClinicGalleryPhoto[]> => {
          console.error("[/portal/clinica] fetchClinicGalleryPhotos failed", error);
          return { status: "error" };
        },
      ),
      fetchMyClinicProfessionals(supabase).then(
        (value): Loaded<PortalProfessional[]> => ({ status: "ok", value }),
        (error): Loaded<PortalProfessional[]> => {
          console.error("[/portal/clinica] fetchMyClinicProfessionals failed", error);
          return { status: "error" };
        },
      ),
    ]);
  }

  const clinicName = clinic?.name ?? "Mi clínica";

  return (
    <PortalShell activeNavLabel={clinicName} heading={clinicName}>
      <MyClinicScreen clinic={clinic} location={location} gallery={gallery} professionals={professionals} />
    </PortalShell>
  );
}
