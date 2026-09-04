import { notFound } from "next/navigation";
import { fetchAppointmentById, fetchClinicalProfessionals } from "@/features/dashboard/appointments-data";
import { RealClinicalEncounterScreen } from "@/features/dashboard/real-clinical-encounter-screen";
import { toBoardProfessional } from "@/features/dashboard/real-format";
import { canStartClinicalEncounter } from "@/features/dashboard/real-status";
import { getWeekDaysContaining } from "@/features/dashboard/real-week";
import { fetchClinicalEncounterByAppointmentId, fetchClinicalEncounterProcedures } from "@/features/patients/clinical-encounters-data";
import { canEditClinicalData } from "@/features/patients/clinical-permissions";
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
// Gated by canEditClinicalData() (Assistant is always excluded — CLAUDE.md's
// Roles: Assistant never attends patients — and so is a dentist/clinic_admin
// with no active professional_profile, mirroring RealAppointmentDetailModal's
// own canAttendPatients gate on "Iniciar/Continuar atención") — enforced
// server-side here, not just by RealClinicalEncounterScreen's own
// client-side useRouteGuard (which only handles a role switch mid-session).
//
// A terminal Cita (cancelled/completed/no_show), or one whose start time
// is still more than canStartClinicalEncounter's window away, is not a
// valid target to attend right now — notFound() rather than a redirect,
// matching this codebase's existing convention for invalid/unauthorized
// real routes (see fetchPatientById's own callers) instead of silently
// bouncing elsewhere. canStartClinicalEncounter (real-status.ts) is the
// exact same helper RealAppointmentDetailModal's "Iniciar atención" CTA
// uses to decide whether to even show the button — reused here, not
// duplicated, so a direct/bookmarked/shared URL opened too early is
// rejected outright instead of only being hidden from the normal UI path
// (and, critically, never flips the Cita to `in_progress` below).
export default async function ClinicalEncounterPage({ params }: { params: Promise<{ appointmentId: string }> }) {
  const { appointmentId } = await params;
  const supabase = await createClient();

  let context;
  try {
    context = await resolveClinicContext(supabase);
  } catch (error) {
    console.error("[/agenda/atencion] resolveClinicContext failed", error);
    notFound();
  }
  if (context.status !== "ok") notFound();
  if (!canEditClinicalData(context)) notFound();

  const clinicId = context.clinic.id;
  const rawAppointment = await fetchAppointmentById(supabase, clinicId, appointmentId);
  if (!rawAppointment) notFound();
  if (!canStartClinicalEncounter(rawAppointment)) notFound();

  // Self-heals a direct/bookmarked/shared URL for a Cita that never went
  // through RealAppointmentDetailModal's "Iniciar atención" (which is the
  // only other place `in_progress` gets set) — without this, the screen
  // would render "En atención" while the real status stayed
  // scheduled/confirmed, and "Finalizar atención" would jump straight to
  // `completed`, skipping `in_progress` entirely (see CLAUDE.md's
  // Appointment Lifecycle). Never runs for an already-`in_progress` Cita
  // (the normal "Continuar atención" case), so a refresh mid-attention is
  // a no-op here.
  let appointment = rawAppointment;
  if (appointment.status !== "in_progress") {
    const { error } = await supabase.from("appointments").update({ status: "in_progress" }).eq("id", appointment.id);
    if (!error) appointment = { ...appointment, status: "in_progress" };
  }

  const weekDays = getWeekDaysContaining(appointment.startsAt);
  const [rawProfessionals, patients, treatmentOptions, roomOptions, toothFindings, existingEncounter] = await Promise.all([
    fetchClinicalProfessionals(supabase, clinicId),
    fetchPatients(supabase, clinicId),
    fetchActiveTreatmentNames(supabase, clinicId),
    fetchActiveRoomNames(supabase, clinicId),
    fetchPatientToothFindings(supabase, clinicId, appointment.patientId),
    // Load/resume check: does this Cita already have a draft or finalized
    // encounter recorded ("Guardar borrador" from an earlier visit to this
    // same URL, or a previous "Finalizar atención" that persisted the
    // encounter but never got to flip the Cita to `completed`)? See
    // real-clinical-encounter-screen.tsx's own comment on how this is
    // used — never re-inserted, only ever upserted from here on.
    fetchClinicalEncounterByAppointmentId(supabase, clinicId, appointmentId),
  ]);

  // Only fetch once we know an encounter (draft or finalized) actually
  // exists — a brand-new attention has no procedures to reconstruct yet.
  const existingProcedures = existingEncounter
    ? await fetchClinicalEncounterProcedures(supabase, clinicId, existingEncounter.id)
    : [];

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
      existingProcedures={existingProcedures}
    />
  );
}
