import { PortalShell } from "@/components/shell/portal-shell";
import { MyProfile } from "@/features/portal/my-profile";
import { resolvePatientContext } from "@/features/session/resolve-patient-context";
import { createClient } from "@/lib/supabase/server";

// Real identity — src/lib/supabase/proxy.ts has already gated this route
// (a real Patient with a valid link), so context.status is "ok" here in
// practice; MyProfile itself renders an honest fallback if somehow not,
// never the old mock CURRENT_PATIENT.
export default async function PortalProfilePage() {
  const supabase = await createClient();
  const context = await resolvePatientContext(supabase);

  return (
    <PortalShell activeNavLabel="Mi perfil" heading="Mi perfil">
      <MyProfile context={context} />
    </PortalShell>
  );
}
