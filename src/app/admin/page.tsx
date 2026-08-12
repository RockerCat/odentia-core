import { AdminGreeting } from "@/components/admin-greeting";
import { AppShell } from "@/components/shell/app-shell";
import { AttentionList } from "@/features/admin/attention-list";
import { MarketplaceOverview } from "@/features/admin/marketplace-overview";
import { MONTHLY_ACTIVITY, PLATFORM_KPIS } from "@/features/admin/mock-data";
import { RecentClinics } from "@/features/admin/recent-clinics";
import { StatGrid } from "@/features/admin/stat-grid";

// Superadmin's home — the platform's state, not a single clinic's Agenda
// (see CLAUDE.md Domain Model). Reached from /login's Superadmin demo
// profile, or directly once a session exists.
export default function AdminPage() {
  return (
    <AppShell activeNavLabel="Inicio" heading={<AdminGreeting />} allowedRoles={["superadmin"]}>
      <div className="flex flex-col gap-6">
        <StatGrid stats={PLATFORM_KPIS} />

        <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold">Actividad este mes</h2>
          <div className="mt-4">
            <StatGrid stats={MONTHLY_ACTIVITY} />
          </div>
        </div>

        <MarketplaceOverview />
        <RecentClinics />
        <AttentionList />
      </div>
    </AppShell>
  );
}
