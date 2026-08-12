import { PortalShell } from "@/components/shell/portal-shell";
import { MyClinicScreen } from "@/features/portal/my-clinic-screen";
import { CURRENT_PATIENT } from "@/lib/current-user";

export default function PortalClinicPage() {
  return (
    <PortalShell activeNavLabel={CURRENT_PATIENT.clinicName} heading={CURRENT_PATIENT.clinicName}>
      <MyClinicScreen />
    </PortalShell>
  );
}
