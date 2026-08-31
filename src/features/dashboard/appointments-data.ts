import type { SupabaseClient } from "@supabase/supabase-js";

// Real /agenda data — same convention as every other real feature
// (src/features/session/resolve-clinic-context.ts, src/features/patients/data.ts,
// src/features/clinic/data.ts): takes an already-constructed SupabaseClient so
// the exact same query logic runs unchanged from a Server Component or a
// Client Component refetch (week navigation). clinic_id always comes from
// resolveClinicContext() — never accepted from a URL/form/DEV role switcher.
//
// public.appointments' patient_id/professional_profile_id are only ever
// enforced via COMPOSITE foreign keys (patient_id, clinic_id) /
// (professional_profile_id, clinic_id) — there is no plain single-column FK
// PostgREST could embed through (same situation already hit by
// src/features/clinic/data.ts's fetchTeamMembers). So this file runs
// independent, sequential queries and merges in JS, on purpose — never a
// clever nested select — so a failure in any one table is diagnosed on its
// own instead of a generic "fetchAppointments failed".

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "patient_arrived"
  | "waiting_room"
  | "in_progress"
  | "completed"
  | "no_show"
  | "cancelled";

export type Appointment = {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  professionalProfileId: string;
  startsAt: string;
  durationMinutes: number;
  reason: string | null;
  room: string | null;
  contactPhone: string | null;
  notes: string | null;
  status: AppointmentStatus;
  patientArrivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AppointmentRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_profile_id: string;
  starts_at: string;
  duration_minutes: number;
  reason: string | null;
  room: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: AppointmentStatus;
  patient_arrived_at: string | null;
  created_at: string;
  updated_at: string;
};

const APPOINTMENT_COLUMNS =
  "id, clinic_id, patient_id, professional_profile_id, starts_at, duration_minutes, reason, room, contact_phone, notes, status, patient_arrived_at, created_at, updated_at";

async function mapRows(supabase: SupabaseClient, rows: AppointmentRow[]): Promise<Appointment[]> {
  const patientIds = [...new Set(rows.map((r) => r.patient_id))];
  const patientsResult = patientIds.length
    ? await supabase.from("patients").select("id, first_name, last_name, phone").in("id", patientIds)
    : { data: [] as { id: string; first_name: string; last_name: string; phone: string | null }[], error: null };
  if (patientsResult.error) throw patientsResult.error;
  const patientById = new Map(patientsResult.data.map((p) => [p.id, p]));

  return rows.map((row) => {
    const patient = patientById.get(row.patient_id);
    return {
      id: row.id,
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Paciente",
      patientPhone: patient?.phone ?? null,
      professionalProfileId: row.professional_profile_id,
      startsAt: row.starts_at,
      durationMinutes: row.duration_minutes,
      reason: row.reason,
      room: row.room,
      contactPhone: row.contact_phone,
      notes: row.notes,
      status: row.status,
      patientArrivedAt: row.patient_arrived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

// [rangeStartIso, rangeEndIso) — used for one week's board at a time so the
// query never grows unbounded as real appointment history accumulates.
export async function fetchAppointmentsForRange(
  supabase: SupabaseClient,
  clinicId: string,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_COLUMNS)
    .eq("clinic_id", clinicId)
    .gte("starts_at", rangeStartIso)
    .lt("starts_at", rangeEndIso)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return mapRows(supabase, data ?? []);
}

export async function fetchAppointmentsForPatient(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return mapRows(supabase, data ?? []);
}

export type ClinicalProfessional = {
  professionalProfileId: string;
  membershipId: string;
  profileId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  specialtyName: string | null;
  defaultAppointmentDurationMinutes: number | null;
  role: "clinic_admin" | "dentist";
};

// The Agenda board's columns: every ACTIVE clinical professional in the
// clinic (dentist OR clinic_admin, each with their own ACTIVE
// professional_profile — mirrors is_active_clinical_professional() exactly,
// see the patient_medical_histories migration and clinical-permissions.ts).
// A pure administrator (no professional_profile, or an inactive one) never
// gets a column, matching CLAUDE.md's Domain Model ("she's a pure
// administrator... must not appear as a column" — the mock's own
// ADMIN_DENTIST_ID hack is unnecessary here: a real clinic_admin who also
// practices simply has her own real professional_profiles row, no synthetic
// entry needed). Assistant is never a column either — assistants don't hold
// professional_profiles.
export async function fetchClinicalProfessionals(
  supabase: SupabaseClient,
  clinicId: string,
): Promise<ClinicalProfessional[]> {
  const membershipsResult = await supabase
    .from("clinic_memberships")
    .select("id, profile_id, role")
    .eq("clinic_id", clinicId)
    .eq("status", "active")
    .in("role", ["clinic_admin", "dentist"]);
  if (membershipsResult.error) throw membershipsResult.error;
  const memberships = membershipsResult.data;
  if (memberships.length === 0) return [];

  const membershipIds = memberships.map((m) => m.id);
  const professionalProfilesResult = await supabase
    .from("professional_profiles")
    .select("id, clinic_membership_id, active, primary_specialty_id, default_appointment_duration_minutes")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .in("clinic_membership_id", membershipIds);
  if (professionalProfilesResult.error) throw professionalProfilesResult.error;
  const professionalProfiles = professionalProfilesResult.data;
  if (professionalProfiles.length === 0) return [];

  const profileIds = memberships.map((m) => m.profile_id);
  const profilesResult = await supabase.from("profiles").select("id, first_name, last_name, avatar_url").in("id", profileIds);
  if (profilesResult.error) throw profilesResult.error;
  const profileById = new Map(profilesResult.data.map((p) => [p.id, p]));

  const specialtyIds = professionalProfiles
    .map((pp) => pp.primary_specialty_id)
    .filter((id): id is string => id !== null);
  const specialtiesResult = specialtyIds.length
    ? await supabase.from("specialties").select("id, name").in("id", specialtyIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (specialtiesResult.error) throw specialtiesResult.error;
  const specialtyNameById = new Map(specialtiesResult.data.map((s) => [s.id, s.name]));

  const membershipById = new Map(memberships.map((m) => [m.id, m]));

  return professionalProfiles.map((pp) => {
    const membership = membershipById.get(pp.clinic_membership_id)!;
    const profile = profileById.get(membership.profile_id);
    return {
      professionalProfileId: pp.id,
      membershipId: membership.id,
      profileId: membership.profile_id,
      firstName: profile?.first_name ?? "",
      lastName: profile?.last_name ?? "",
      avatarUrl: profile?.avatar_url ?? null,
      specialtyName: pp.primary_specialty_id ? (specialtyNameById.get(pp.primary_specialty_id) ?? null) : null,
      defaultAppointmentDurationMinutes: pp.default_appointment_duration_minutes,
      role: membership.role as "clinic_admin" | "dentist",
    };
  });
}
