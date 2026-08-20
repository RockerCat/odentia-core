import { AppShell } from "@/components/shell/app-shell";
import { SubscriptionScreen } from "@/features/subscription/subscription-screen";

// Mi Suscripción — Clinic Admin only ("Subscription and billing" per
// CLAUDE.md Domain Model; Dentist/Assistant already filter this label out
// of their own nav in src/dev/role.ts). UI/UX only, mock data.
export default function SuscripcionPage() {
  return (
    <AppShell activeNavLabel="Mi Suscripción" heading="Mi Suscripción" allowedRoles={["clinic-admin"]}>
      <SubscriptionScreen />
    </AppShell>
  );
}
