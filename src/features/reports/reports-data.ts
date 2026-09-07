import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTeamMembers } from "@/features/clinic/data";
import type { AppointmentStatus } from "@/features/dashboard/appointments-data";
import type { DateRange } from "./report-period";

// Real /reportes data — replaces mock-data.ts's synthetic ReportEncounter
// (one fake entity conflating "cita" and "atención") with the actual real
// tables: appointments (cita-level outcomes — scheduled/completed/no_show/
// cancelled), patient_clinical_encounters (clinical work actually
// performed, gated on finalized_at), and patient_clinical_encounter_procedures
// (structured "procedimientos realizados"). See reports-screen.tsx's own
// comment for which metric reads from which source and why they're
// deliberately NOT the same dataset.
//
// clinic_id always comes from resolveClinicContext() (src/app/reportes/
// page.tsx) — never accepted from a filter/URL as its own source of
// authority; every query below still filters by it explicitly (defense in
// depth on top of RLS, same convention as fetchPatientById).

export type ReportProfessional = {
  id: string; // professional_profiles.id
  profileId: string; // profiles.id — the key patient_clinical_encounters.attended_by is keyed on
  name: string;
  initials: string;
  specialty: string;
  avatarUrl?: string;
};

// Every active clinical professional in the clinic (Dentist, or Clinic
// Admin with her own professional_profile) — same "who counts as an
// odontólogo" set already established for Configuración's Horario/
// Ausencias selector (disponibilidad-admin-section.tsx): fetchTeamMembers,
// filtered to professionalProfile !== null. Reused here rather than a
// second query, since it's the exact same real professional roster.
export async function fetchReportProfessionals(supabase: SupabaseClient, clinicId: string): Promise<ReportProfessional[]> {
  const members = await fetchTeamMembers(supabase, clinicId);
  return members
    .filter((m) => m.professionalProfile !== null)
    .map((m) => {
      const name = `${m.firstName} ${m.lastName}`.trim() || m.email;
      const initials = `${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase() || m.email[0]?.toUpperCase() || "?";
      return {
        id: m.professionalProfile!.id,
        profileId: m.profileId,
        name,
        initials,
        specialty: m.professionalProfile!.specialtyName ?? "",
        avatarUrl: m.avatarUrl ?? undefined,
      };
    });
}

export type ReportAppointment = {
  id: string;
  professionalProfileId: string;
  patientId: string;
  startsAt: Date;
  status: AppointmentStatus;
};

function mapAppointmentRow(row: { id: string; professional_profile_id: string; patient_id: string; starts_at: string; status: AppointmentStatus }): ReportAppointment {
  return {
    id: row.id,
    professionalProfileId: row.professional_profile_id,
    patientId: row.patient_id,
    startsAt: new Date(row.starts_at),
    status: row.status,
  };
}

// "Citas programadas"/"No asistencias"/"Cancelaciones"/"Tasa de asistencia"
// — cita-level outcomes (rule: "Usar appointments reales... completed =
// cita completada; cancelled = cancelada; no_show = no asistió. Nunca
// inferir completed por fecha/hora."). Scoped by starts_at falling in the
// selected period — every status included (a "cita programada" counts
// regardless of how it was later resolved), matching the approved UI's
// own "Citas programadas" meaning.
export async function fetchAppointmentsInRange(
  supabase: SupabaseClient,
  clinicId: string,
  range: DateRange,
  professionalProfileId: string | null,
): Promise<ReportAppointment[]> {
  let query = supabase
    .from("appointments")
    .select("id, professional_profile_id, patient_id, starts_at, status")
    .eq("clinic_id", clinicId)
    .gte("starts_at", range.start.toISOString())
    .lte("starts_at", range.end.toISOString());
  if (professionalProfileId) query = query.eq("professional_profile_id", professionalProfileId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapAppointmentRow);
}

// "Con próxima cita" — a standing fact independent of the selected period
// (same reasoning as the old mock's own computePatientsStats comment):
// any future, non-terminal appointment, from right now onward.
export async function fetchUpcomingAppointments(
  supabase: SupabaseClient,
  clinicId: string,
  now: Date,
  professionalProfileId: string | null,
): Promise<ReportAppointment[]> {
  let query = supabase
    .from("appointments")
    .select("id, professional_profile_id, patient_id, starts_at, status")
    .eq("clinic_id", clinicId)
    .gt("starts_at", now.toISOString())
    .not("status", "in", "(completed,cancelled,no_show)");
  if (professionalProfileId) query = query.eq("professional_profile_id", professionalProfileId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapAppointmentRow);
}

export type ReportEncounter = {
  id: string;
  patientId: string;
  attendedByProfileId: string | null;
  occurredAt: Date;
};

function mapEncounterRow(row: { id: string; patient_id: string; attended_by: string | null; occurred_at: string }): ReportEncounter {
  return { id: row.id, patientId: row.patient_id, attendedByProfileId: row.attended_by, occurredAt: new Date(row.occurred_at) };
}

// "Atenciones completadas"/activity chart/"Actividad por profesional"'s
// atenciones+pacientes-atendidos columns/"Procedimientos realizados" —
// clinical work ACTUALLY performed (rule: "usar encounters FINALIZADOS...
// no usar simplemente citas pasadas"). finalized_at IS NOT NULL is the
// only correct filter — a draft (Guardar borrador, not yet Finalizar
// atención) never counts. attendedByProfileId is `profiles.id`
// (attended_by), not a professional_profile_id — callers map it through
// ReportProfessional.profileId themselves (see reports-screen.tsx), since
// this table has no professional_profile_id column of its own.
//
// range === null means all-time (used for the patients section's standing
// facts — primera/última visita — which must never be truncated to the
// selected period, same as the old mock's own computePatientsStats
// reading REPORT_ENCOUNTERS in full rather than the filtered slice).
export async function fetchFinalizedEncounters(
  supabase: SupabaseClient,
  clinicId: string,
  range: DateRange | null,
  attendedByProfileId: string | null,
): Promise<ReportEncounter[]> {
  let query = supabase
    .from("patient_clinical_encounters")
    .select("id, patient_id, attended_by, occurred_at")
    .eq("clinic_id", clinicId)
    .not("finalized_at", "is", null);
  if (range) query = query.gte("occurred_at", range.start.toISOString()).lte("occurred_at", range.end.toISOString());
  if (attendedByProfileId) query = query.eq("attended_by", attendedByProfileId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapEncounterRow);
}

export type ReportProcedure = { encounterId: string; name: string };

// Structured "procedimientos realizados" — patient_clinical_encounter_procedures,
// never the treatments catalog (a treatment can be planned/offered without
// ever being performed) and never a treatment plan (a plan is not a
// record of work done). Scoped to a specific set of already-period-and-
// professional-filtered encounter ids (see fetchFinalizedEncounters above)
// rather than its own date/professional filter — this table has neither
// column, only encounter_id.
export async function fetchProceduresForEncounters(
  supabase: SupabaseClient,
  clinicId: string,
  encounterIds: string[],
): Promise<ReportProcedure[]> {
  if (encounterIds.length === 0) return [];
  const { data, error } = await supabase
    .from("patient_clinical_encounter_procedures")
    .select("encounter_id, name")
    .eq("clinic_id", clinicId)
    .in("encounter_id", encounterIds);
  if (error) throw error;
  return (data ?? []).map((row) => ({ encounterId: row.encounter_id, name: row.name }));
}
