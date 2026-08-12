import { PortalShell } from "@/components/shell/portal-shell";
import { DentalHealth } from "@/features/portal/dental-health";

export default function PortalDentalHealthPage() {
  return (
    <PortalShell activeNavLabel="Mi salud dental" heading="Mi salud dental">
      <DentalHealth />
    </PortalShell>
  );
}
