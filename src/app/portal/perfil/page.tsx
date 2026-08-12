import { PortalShell } from "@/components/shell/portal-shell";
import { MyProfile } from "@/features/portal/my-profile";

export default function PortalProfilePage() {
  return (
    <PortalShell activeNavLabel="Mi perfil" heading="Mi perfil">
      <MyProfile />
    </PortalShell>
  );
}
