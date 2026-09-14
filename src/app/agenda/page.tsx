import { AppShell } from "@/components/shell/app-shell";
import { ClinicIdentityCard } from "@/features/dashboard/clinic-identity-card";
import { MarketplaceCard } from "@/features/dashboard/marketplace-card";
import { RealAgendaScreen } from "@/features/dashboard/real-agenda-screen";
import { fetchAppointmentsForRange, fetchClinicalProfessionals } from "@/features/dashboard/appointments-data";
import { fetchPendingAppointmentRequests } from "@/features/dashboard/appointment-requests-data";
import { fetchClinicWeeklyAvailability } from "@/features/settings/availability-data";
import { getWeekRangeIso } from "@/features/dashboard/real-week";
import { canEditClinicalData } from "@/features/patients/clinical-permissions";
import { EMPTY_PATIENT_IDENTITY_CATALOGS, fetchPatients, type PatientIdentityCatalogs } from "@/features/patients/data";
import { fetchPatientIdentityCatalogs } from "@/features/patients/identity-catalogs";
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
  let availability: Awaited<ReturnType<typeof fetchClinicWeeklyAvailability>> = [];
  let appointments: Awaited<ReturnType<typeof fetchAppointmentsForRange>> = [];
  let patients: Awaited<ReturnType<typeof fetchPatients>> = [];
  let treatmentOptions: string[] = [];
  let roomOptions: string[] = [];
  // Solicitudes de Cita — scoped by RLS to exactly what this caller may
  // act on (clinic-wide for Clinic Admin/Assistant, own-professional only
  // for a Dentist), never filtered client-side.
  let appointmentRequests: Awaited<ReturnType<typeof fetchPendingAppointmentRequests>> = [];
  // TEMP DIAGNOSTIC (remove once root cause is confirmed) — the plain
  // `console.error("[/agenda] load failed", error)` below serializes to
  // `{}` in the dev overlay for a native Error (message/stack are
  // non-enumerable, so JSON-ish serialization drops them) and gives no
  // way to tell which of these 6 parallel fetches actually threw. Each
  // promise is tagged so a failure logs its own operation name + only
  // code/message/details/hint — extracted into a fresh plain object so it
  // survives serialization regardless of whether the underlying error is
  // a PostgrestError or a native Error. No tokens/cookies/PII/clinical
  // payload.
  function logAgendaLoadFailure(operation: string, err: unknown) {
    const e = err as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
    console.error("[/agenda] load failed", {
      operation,
      code: e?.code ?? null,
      message: typeof e?.message === "string" ? e.message : String(err),
      details: e?.details ?? null,
      hint: e?.hint ?? null,
    });
  }
  function tag<T>(operation: string, p: Promise<T>): Promise<T> {
    return p.catch((err) => {
      logAgendaLoadFailure(operation, err);
      throw err;
    });
  }
  try {
    const { startIso, endIsoExclusive } = getWeekRangeIso(0);
    [professionals, availability, appointments, patients, treatmentOptions, roomOptions, appointmentRequests] = await Promise.all([
      tag("fetchClinicalProfessionals", fetchClinicalProfessionals(supabase, clinicId)),
      // Bug fix: real-appointments-board.tsx used to always render
      // schedule-config.ts's hardcoded 08:00–18:00 range regardless of the
      // professional's actual professional_availability — see
      // agenda-hours.ts.
      tag("fetchClinicWeeklyAvailability", fetchClinicWeeklyAvailability(supabase, clinicId)),
      tag("fetchAppointmentsForRange", fetchAppointmentsForRange(supabase, clinicId, startIso, endIsoExclusive)),
      tag("fetchPatients", fetchPatients(supabase, clinicId)),
      tag("fetchActiveTreatmentNames", fetchActiveTreatmentNames(supabase, clinicId)),
      tag("fetchActiveRoomNames", fetchActiveRoomNames(supabase, clinicId)),
      tag("fetchPendingAppointmentRequests", fetchPendingAppointmentRequests(supabase, clinicId)),
    ]);
  } catch (error) {
    console.error("[/agenda] load failed (outer)", error);
    loadFailed = true;
  }

  // RIPS #3 — feeds PatientRecordModal's identity fields in this screen's
  // own "Ver paciente" flow (see real-appointments-board.tsx); optional
  // for the page as a whole, same handling as everything else above.
  let identityCatalogs: PatientIdentityCatalogs = EMPTY_PATIENT_IDENTITY_CATALOGS;
  try {
    identityCatalogs = await fetchPatientIdentityCatalogs();
  } catch (error) {
    console.error("[/agenda] fetchPatientIdentityCatalogs failed", error);
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
          initialAvailability={availability}
          initialAppointments={appointments}
          initialPatients={patients}
          initialAppointmentRequests={appointmentRequests}
          treatmentOptions={treatmentOptions}
          roomOptions={roomOptions}
          canEditPatientData={canEditPatientData}
          canAttendPatients={canAttendPatients}
          identityCatalogs={identityCatalogs}
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
