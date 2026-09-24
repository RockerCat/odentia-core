import { PortalShell } from "@/components/shell/portal-shell";
import { DentalHealthSkeleton } from "@/features/portal/dental-health";

// Skeleton while /portal/salud's real reads resolve — never mock content.
export default function PortalDentalHealthLoading() {
  return (
    <PortalShell activeNavLabel="Mi salud dental" heading="Mi salud dental">
      <DentalHealthSkeleton />
    </PortalShell>
  );
}
