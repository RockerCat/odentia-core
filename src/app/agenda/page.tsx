import { AppShell } from "@/components/shell/app-shell";
import { AlertsCard } from "@/features/dashboard/alerts-card";
import { AppointmentsCard } from "@/features/dashboard/appointments-card";
import { MarketplaceCard } from "@/features/dashboard/marketplace-card";
import {
  CURRENT_WEEK_LABEL,
  DENTISTS,
  OPERATIONAL_ALERTS,
  TODAY_SUMMARY,
  WEEK_APPOINTMENTS,
  WEEK_DAYS,
} from "@/features/dashboard/mock-data";
import { SummaryCards } from "@/features/dashboard/summary-cards";
import { CURRENT_USER } from "@/lib/current-user";
import { getGreeting } from "@/lib/greeting";

export default function AgendaPage() {
  return (
    <AppShell activeNavLabel="Agenda" heading={getGreeting(CURRENT_USER.name)}>
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AppointmentsCard
            appointments={WEEK_APPOINTMENTS}
            dentists={DENTISTS}
            weekDays={WEEK_DAYS}
            weekLabel={CURRENT_WEEK_LABEL}
          />
        </div>

        <div className="flex flex-col gap-7">
          <SummaryCards metrics={TODAY_SUMMARY} />
          <AlertsCard alerts={OPERATIONAL_ALERTS} />
          <MarketplaceCard />
        </div>
      </div>
    </AppShell>
  );
}
