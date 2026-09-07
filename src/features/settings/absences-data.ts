import type { SupabaseClient } from "@supabase/supabase-js";

// Real Ausencias/vacaciones — replaces ABSENCES_MOCK/ABSENCES_BY_DENTIST
// (dentist-mock-data.ts) with persistence against professional_absences.
// Date-only (whole-day) ranges — see that table's own migration comment
// for why the old mock's allDay/startTime/endTime split isn't carried
// over. clinic_id/professional_profile_id are never trusted beyond "which
// row to read/write" — professional_absences' own RLS
// (can_manage_professional_schedule) is the real enforcement.

export type Absence = {
  id: string;
  clinicId: string;
  professionalProfileId: string;
  reason: string | null;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string; // ISO yyyy-mm-dd
  active: boolean;
};

type AbsenceRow = {
  id: string;
  clinic_id: string;
  professional_profile_id: string;
  reason: string | null;
  start_date: string;
  end_date: string;
  active: boolean;
};

const ABSENCE_COLUMNS = "id, clinic_id, professional_profile_id, reason, start_date, end_date, active";

function mapRow(row: AbsenceRow): Absence {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    professionalProfileId: row.professional_profile_id,
    reason: row.reason,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.active,
  };
}

export async function fetchAbsences(supabase: SupabaseClient, professionalProfileId: string): Promise<Absence[]> {
  const { data, error } = await supabase
    .from("professional_absences")
    .select(ABSENCE_COLUMNS)
    .eq("professional_profile_id", professionalProfileId)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export type ActionOutcome = { status: "ok" } | { status: "error"; message: string };
export type AbsenceOutcome = { status: "ok"; absence: Absence } | { status: "error"; message: string };

const GENERIC_ERROR = "No pudimos guardar la ausencia. Intenta de nuevo.";
export const DATE_RANGE_ERROR = "La fecha final debe ser igual o posterior a la fecha inicial.";

export type AbsenceInput = {
  clinicId: string;
  professionalProfileId: string;
  reason: string;
  startDate: string;
  endDate: string;
};

export async function createAbsence(supabase: SupabaseClient, input: AbsenceInput): Promise<AbsenceOutcome> {
  if (input.endDate < input.startDate) return { status: "error", message: DATE_RANGE_ERROR };
  const { data, error } = await supabase
    .from("professional_absences")
    .insert({
      clinic_id: input.clinicId,
      professional_profile_id: input.professionalProfileId,
      reason: input.reason.trim() || null,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .select(ABSENCE_COLUMNS)
    .single();
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok", absence: mapRow(data) };
}

export async function updateAbsence(
  supabase: SupabaseClient,
  absenceId: string,
  patch: { reason: string; startDate: string; endDate: string },
): Promise<AbsenceOutcome> {
  if (patch.endDate < patch.startDate) return { status: "error", message: DATE_RANGE_ERROR };
  const { data, error } = await supabase
    .from("professional_absences")
    .update({ reason: patch.reason.trim() || null, start_date: patch.startDate, end_date: patch.endDate })
    .eq("id", absenceId)
    .select(ABSENCE_COLUMNS)
    .single();
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok", absence: mapRow(data) };
}

export async function deleteAbsence(supabase: SupabaseClient, absenceId: string): Promise<ActionOutcome> {
  const { error } = await supabase.from("professional_absences").delete().eq("id", absenceId);
  if (error) return { status: "error", message: GENERIC_ERROR };
  return { status: "ok" };
}

// Honest warning, never an automatic change: "no borrar/mover citas
// automáticamente" (task scope) — this only ever informs the person
// creating/editing an absence that existing, real appointments already
// fall inside the range they're about to save; saving the absence still
// proceeds regardless of what this returns. Scoped to non-terminal
// appointments (a cancelled/completed/no-show one isn't a real conflict),
// same TERMINAL_STATUSES list dashboard/real-status.ts already uses —
// duplicated here as a literal since this file lives in features/settings,
// not features/dashboard, and importing across that boundary for three
// strings would be a bigger coupling than repeating them.
export type ConflictingAppointment = {
  id: string;
  patientName: string;
  startsAt: string;
};

export async function fetchConflictingAppointments(
  supabase: SupabaseClient,
  clinicId: string,
  professionalProfileId: string,
  startDate: string,
  endDate: string,
): Promise<ConflictingAppointment[]> {
  const rangeStart = `${startDate}T00:00:00`;
  const rangeEndExclusive = new Date(`${endDate}T00:00:00`);
  rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 1);

  const { data, error } = await supabase
    .from("appointments")
    .select("id, patient_id, starts_at")
    .eq("clinic_id", clinicId)
    .eq("professional_profile_id", professionalProfileId)
    .not("status", "in", "(completed,cancelled,no_show)")
    .gte("starts_at", rangeStart)
    .lt("starts_at", rangeEndExclusive.toISOString());
  if (error) return [];
  if (data.length === 0) return [];

  const patientIds = [...new Set(data.map((row) => row.patient_id))];
  const patientsResult = await supabase.from("patients").select("id, first_name, last_name").in("id", patientIds);
  const patientById = new Map((patientsResult.data ?? []).map((p) => [p.id, p]));

  return data.map((row) => {
    const patient = patientById.get(row.patient_id);
    return {
      id: row.id,
      patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Paciente",
      startsAt: row.starts_at,
    };
  });
}
