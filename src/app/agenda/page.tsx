import { AppShell } from "@/components/shell/app-shell";
import { ClinicIdentityCard } from "@/features/dashboard/clinic-identity-card";
import { MarketplaceCard } from "@/features/dashboard/marketplace-card";
import { RealAgendaScreen } from "@/features/dashboard/real-agenda-screen";
import { fetchAppointmentsForRange, fetchClinicalProfessionals } from "@/features/dashboard/appointments-data";
import { getWeekRangeIso } from "@/features/dashboard/real-week";
import { canEditClinicalData } from "@/features/patients/clinical-permissions";
import { fetchPatients } from "@/features/patients/data";
import { fetchActiveTreatmentNames } from "@/features/treatments/data";
import { fetchActiveRoomNames } from "@/features/rooms/data";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";
import { Greeting } from "@/components/greeting";

// Real /agenda — server-first (same pattern as /clinica, /pacientes):
// resolves the real clinic context and the current week's real appointments/
// professionals/patients here, before any client render. src/lib/supabase/
// proxy.ts already gates this route on a real, active membership; clinic_id/
// role/professionalProfile here only ever come from resolveClinicContext(),
// never the DEV role switcher. RealAgendaScreen (client) owns week
// navigation and the shared appointment state from here on.
export default async function AgendaPage() {
  const supabase = await createClient();

  let context;
  try {
    context = await resolveClinicContext(supabase);
  } catch (error) {
    console.error("[/agenda] resolveClinicContext failed", error);
    return (
      <AppShell activeNavLabel="Agenda" heading={<Greeting />} allowedRoles={["clinic-admin", "dentist", "assistant"]}>
        <p className="text-sm text-muted-foreground">No pudimos cargar tu agenda. Intenta de nuevo en unos minutos.</p>
      </AppShell>
    );
  }

  if (context.status !== "ok") {
    return (
      <AppShell activeNavLabel="Agenda" heading={<Greeting />} allowedRoles={["clinic-admin", "dentist", "assistant"]}>
        <p className="text-sm text-muted-foreground">No pudimos cargar tu agenda. Intenta de nuevo en unos minutos.</p>
      </AppShell>
    );
  }

  const clinicId = context.clinic.id;
  let loadFailed = false;
  let professionals: Awaited<ReturnType<typeof fetchClinicalProfessionals>> = [];
  let appointments: Awaited<ReturnType<typeof fetchAppointmentsForRange>> = [];
  let patients: Awaited<ReturnType<typeof fetchPatients>> = [];
  let treatmentOptions: string[] = [];
  let roomOptions: string[] = [];
  try {
    const { startIso, endIsoExclusive } = getWeekRangeIso(0);
    [professionals, appointments, patients, treatmentOptions, roomOptions] = await Promise.all([
      fetchClinicalProfessionals(supabase, clinicId),
      fetchAppointmentsForRange(supabase, clinicId, startIso, endIsoExclusive),
      fetchPatients(supabase, clinicId),
      fetchActiveTreatmentNames(supabase, clinicId),
      fetchActiveRoomNames(supabase, clinicId),
    ]);
  } catch (error) {
    console.error("[/agenda] load failed", error);
    loadFailed = true;
  }

  const canEditPatientData = context.membership.role !== "dentist";
  // "Iniciar/Continuar atención" writes a real clinical encounter at
  // "Finalizar atención" (insert_patient_clinical_encounter), which requires
  // an active professional_profile (see clinical-permissions.ts and that
  // RPC's own is_active_clinical_professional check) — a Clinic Admin with
  // no professional_profile configured can otherwise move a Cita to
  // in_progress and fill in the whole encounter form before hitting a
  // permission error only at the very last step. Gating the CTA with the
  // same rule Historia Clínica already uses avoids that dead-end.
  const canAttendPatients = canEditClinicalData(context);

  return (
    <AppShell activeNavLabel="Agenda" heading={<Greeting />} allowedRoles={["clinic-admin", "dentist", "assistant"]}>
      {loadFailed ? (
        <p className="text-sm text-muted-foreground">No pudimos cargar tu agenda. Intenta de nuevo en unos minutos.</p>
      ) : (
        <RealAgendaScreen
          clinicId={clinicId}
          role={context.membership.role}
          ownProfessionalProfileId={context.professionalProfile?.id ?? null}
          initialProfessionals={professionals}
          initialAppointments={appointments}
          initialPatients={patients}
          treatmentOptions={treatmentOptions}
          roomOptions={roomOptions}
          canEditPatientData={canEditPatientData}
          canAttendPatients={canAttendPatients}
          // key= here isn't for a list — RealAgendaScreen places these as
          // static siblings, not a .map() — but React 19.2.8's dev-mode key
          // validation flags a Client Component's static children array
          // when it mixes elements it created itself (RealSummaryCards)
          // with ones created by an ancestor Server Component (this page)
          // and passed down as props (these two). Without a key here, this
          // page reliably logs "Each child in a list should have a unique
          // key prop... Check the render method of RealAgendaScreen. It
          // was passed a child from AgendaPage." on every real load — see
          // src/app/dev-qa/agenda-preview/page.tsx, the regression fixture
          // for exactly this (it must stay a Server Component, not "use
          // client", to actually catch this class of bug).
          clinicIdentityCard={<ClinicIdentityCard key="clinic-identity" clinicName={context.clinic.name} clinicLogoUrl={context.clinic.logoUrl} />}
          marketplaceCard={<MarketplaceCard key="marketplace" />}
        />
      )}
    </AppShell>
  );
}
