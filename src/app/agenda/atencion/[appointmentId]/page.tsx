import { notFound } from "next/navigation";
import { fetchAppointmentById, fetchClinicalProfessionals } from "@/features/dashboard/appointments-data";
import { RealClinicalEncounterScreen } from "@/features/dashboard/real-clinical-encounter-screen";
import { toBoardProfessional } from "@/features/dashboard/real-format";
import { getWeekDaysContaining } from "@/features/dashboard/real-week";
import { fetchClinicalEncounterByAppointmentId } from "@/features/patients/clinical-encounters-data";
import { fetchPatients } from "@/features/patients/data";
import { fetchPatientToothFindings } from "@/features/patients/tooth-findings-data";
import { fetchActiveTreatmentNames } from "@/features/treatments/data";
import { fetchActiveRoomNames } from "@/features/rooms/data";
import { resolveClinicContext } from "@/features/session/resolve-clinic-context";
import { createClient } from "@/lib/supabase/server";

// Real "Iniciar/Continuar atención" route — the destination
// RealAppointmentDetailModal's primary CTA (src/features/dashboard/real-appointment-detail-modal.tsx)
// navigates to after moving a Cita to `in_progress`. Server-first, same
// pattern as /agenda/page.tsx: everything the screen needs is fetched here,
// scoped to the real, resolved clinic — never trusting the URL's
// appointmentId to already belong to this clinic (fetchAppointmentById
// filters by clinic_id, not just id). This is also what makes a page
// refresh mid-attention reconstruct correctly: the Cita and its Odontograma
// findings are re-read fresh from Postgres, not from client-only state.
//
// Assistant is excluded from allowedRoles-equivalent gating here (see
// CLAUDE.md's Roles: Assistant never attends patients) — enforced
// server-side via the role check below, not just by RealClinicalEncounterScreen's
// own client-side useRouteGuard (which only handles a role switch mid-session).
//
// A terminal Cita (cancelled/completed/no_show) is not a valid target to
// attend — notFound() rather than a redirect, matching this codebase's
// existing convention for invalid/unauthorized real routes (see
// fetchPatientById's own callers) instead of silently bouncing elsewhere.
export default async function ClinicalEncounterPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  const supabase = await createClient();
  const context = await resolveClinicContext(supabase);
  if (context.status !== "ok") notFound();
  if (context.membership.role === "assistant") notFound();

  const clinicId = context.clinic.id;
  const appointment = await fetchAppointmentById(supabase, clinicId, appointmentId);
  if (!appointment) notFound();
  if (appointment.status === "cancelled" || appointment.status === "completed" || appointment.status === "no_show") {
    notFound();
  }

  const weekDays = getWeekDaysContaining(appointment.startsAt);
  const [rawProfessionals, patients, treatmentOptions, roomOptions, toothFindings, existingEncounter] = await Promise.all([
    fetchClinicalProfessionals(supabase, clinicId),
    fetchPatients(supabase, clinicId),
    fetchActiveTreatmentNames(supabase, clinicId),
    fetchActiveRoomNames(supabase, clinicId),
    fetchPatientToothFindings(supabase, clinicId, appointment.patientId),
    // Load/resume check: does this Cita already have its encounter
    // recorded (a previous "Finalizar atención" that persisted the
    // encounter but never got to flip the Cita to `completed`)? See
    // real-clinical-encounter-screen.tsx's own comment on how this is
    // used — never re-inserted, only ever completed from here on.
    fetchClinicalEncounterByAppointmentId(supabase, clinicId, appointmentId),
  ]);

  const professionals = rawProfessionals.map(toBoardProfessional);
  const professional = professionals.find((p) => p.professionalProfileId === appointment.professionalProfileId) ?? null;

  return (
    <RealClinicalEncounterScreen
      appointment={appointment}
      professional={professional}
      clinicId={clinicId}
      patients={patients}
      professionals={professionals}
      weekDays={weekDays}
      treatmentOptions={treatmentOptions}
      roomOptions={roomOptions}
      initialToothFindings={toothFindings}
      existingEncounter={existingEncounter}
    />
  );
}
