import { AppShell } from "@/components/shell/app-shell";
import { AlertsCard } from "@/features/dashboard/alerts-card";
import { AppointmentsCard } from "@/features/dashboard/appointments-card";
import { MarketplaceCard } from "@/features/dashboard/marketplace-card";
import {
  OPERATIONAL_ALERTS,
  TODAY_APPOINTMENTS,
  TODAY_SUMMARY,
} from "@/features/dashboard/mock-data";
import { SummaryCards } from "@/features/dashboard/summary-cards";

export default function Home() {
  return (
    <AppShell title="Dashboard">
      <div className="flex flex-col gap-6">
        <SummaryCards metrics={TODAY_SUMMARY} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AppointmentsCard appointments={TODAY_APPOINTMENTS} />
          </div>

          <div className="flex flex-col gap-6">
            <AlertsCard alerts={OPERATIONAL_ALERTS} />
            <MarketplaceCard />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
