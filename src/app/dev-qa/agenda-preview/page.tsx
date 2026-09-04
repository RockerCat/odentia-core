// Dev-only QA fixture route — deliberately NOT "use client": a real async
// Server Component, exactly matching /agenda/page.tsx's own shape (AppShell
// → RealAgendaScreen, including Sidebar/Header/MobileHeader/BottomTabBar/
// RoleSwitcher, not RealAgendaScreen in isolation), with deterministic
// synthetic data, so scripts/qa-agenda-console-check.mjs can load it
// without a real Supabase session and assert zero unexpected console
// output. 404s outside development — never a real, production-reachable
// route.
//
// Being a Server Component here is load-bearing, not incidental: the
// "missing key" regression this fixture exists to catch (see
// clinicIdentityCard/marketplaceCard below) only manifests when the JSX
// element crosses the Server→Client boundary — a Server Component's
// `_owner` info survives RSC/Flight serialization differently than a
// live Client Component Fiber's does, and React 19.2.8's dev-mode key
// validation only flags the resulting mixed-owner static children array
// in that case. An earlier version of this fixture was "use client" and,
// despite byte-for-byte identical data, never reproduced the bug — only
// converting it to a genuine Server Component did. Don't revert this to
// "use client".
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { Greeting } from "@/components/greeting";
import { ClinicIdentityCard } from "@/features/dashboard/clinic-identity-card";
import { ConsoleCapture } from "./console-capture"; // permanent — see that file's own comment
import { MarketplaceCard } from "@/features/dashboard/marketplace-card";
import { RealAgendaScreen } from "@/features/dashboard/real-agenda-screen";
import { FIXTURE_CLINIC_ID, fixtureAppointments, fixturePatients, fixtureProfessionals } from "./fixtures";

export default async function AgendaPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <AppShell activeNavLabel="Agenda" heading={<Greeting />} allowedRoles={["clinic-admin", "dentist", "assistant"]}>
      <ConsoleCapture />
      <RealAgendaScreen
        clinicId={FIXTURE_CLINIC_ID}
        role="clinic_admin"
        ownProfessionalProfileId={fixtureProfessionals[0]!.professionalProfileId}
        initialProfessionals={fixtureProfessionals}
        initialAppointments={fixtureAppointments}
        initialPatients={fixturePatients}
        treatmentOptions={[
          "Blanqueamiento dental",
          "Chequeo general",
          "Consulta de ortodoncia",
          "Control de ortodoncia",
          "Extracción dental",
          "Limpieza dental",
          "Primera consulta",
          "Tratamiento de conductos",
        ]}
        roomOptions={["Consultorio 1", "Consultorio 2", "Consultorio 3"]}
        canEditPatientData={true}
        canAttendPatients={true}
        // key= here isn't for a list — RealAgendaScreen places these as
        // static siblings, not a .map() — but React 19.2.8's dev-mode key
        // validation flags a Client Component's static children array when
        // it mixes elements it created itself (RealSummaryCards below)
        // with ones created by an ancestor Server Component and passed
        // down as props (these two). See this file's own top comment.
        clinicIdentityCard={<ClinicIdentityCard key="clinic-identity" clinicName="Dental Test" clinicLogoUrl="https://example.com/logo.png" />}
        marketplaceCard={<MarketplaceCard key="marketplace" />}
      />
    </AppShell>
  );
}
