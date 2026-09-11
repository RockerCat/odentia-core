import { AppShell } from "@/components/shell/app-shell";
import { RipsScreen } from "@/features/rips/rips-screen";

// Real /rips — RIPS #5's first screen. Admin Clínica only (see
// src/dev/role.ts's own ROLE_NAV_ITEMS exclusions and this task's own
// Section 36 "preferencia conservadora para MVP"): allowedRoles here is
// the real, server/route-guard-enforced gate (see AppShell/useRouteGuard,
// both backed by the REAL resolved role via role-bridge.ts, never the
// dev mock alone) — every server action this screen calls
// (getRipsPeriodSummaryAction/generateRipsSinFacturaExportAction, see
// export-actions.ts) independently re-checks role === 'clinic_admin'
// too, so a hidden nav item or a client-side guard alone is never the
// only thing standing between a Dentist/Assistant and this data.
export default function RipsPage() {
  return (
    <AppShell activeNavLabel="RIPS" heading="RIPS" allowedRoles={["clinic-admin"]}>
      <RipsScreen />
    </AppShell>
  );
}
