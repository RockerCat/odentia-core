import { PortalShell } from "@/components/shell/portal-shell";
import { MedicalRecord } from "@/features/portal/medical-record";

export default function PortalMedicalRecordPage() {
  return (
    <PortalShell activeNavLabel="Mi Historia Clínica" heading="Mi Historia Clínica">
      <MedicalRecord />
    </PortalShell>
  );
}
