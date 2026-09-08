import { PortalShell } from "@/components/shell/portal-shell";
import { fetchPrimaryLocation, type PrimaryLocation } from "@/features/clinic/data";
import { MyClinicScreen } from "@/features/portal/my-clinic-screen";
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

  const clinicName = clinic?.name ?? "Mi clínica";

  return (
    <PortalShell activeNavLabel={clinicName} heading={clinicName}>
      <MyClinicScreen clinic={clinic} location={location} />
    </PortalShell>
  );
}
