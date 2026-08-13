import { AppShell } from "@/components/shell/app-shell";
import { AppointmentsCard } from "@/features/dashboard/appointments-card";
import { ClinicIdentityCard } from "@/features/dashboard/clinic-identity-card";
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
import { Greeting } from "@/components/greeting";

export default function AgendaPage() {
  return (
    <AppShell
      activeNavLabel="Agenda"
      heading={<Greeting />}
      allowedRoles={["clinic-admin", "dentist", "assistant"]}
    >
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
          <ClinicIdentityCard />
          <SummaryCards
            // SummaryCards is a Client Component (needs state for the KPI
            // detail modal); a Server Component can only hand it already-
            // rendered JSX, not the raw icon component reference.
            metrics={TODAY_SUMMARY.map((metric) => ({
              ...metric,
              icon: <metric.icon className="size-4" />,
            }))}
            appointments={WEEK_APPOINTMENTS}
            weekDays={WEEK_DAYS}
            dentists={DENTISTS}
            alerts={OPERATIONAL_ALERTS}
          />
          <MarketplaceCard />
        </div>
      </div>
    </AppShell>
  );
}
