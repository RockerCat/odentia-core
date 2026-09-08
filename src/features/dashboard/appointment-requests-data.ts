import type { SupabaseClient } from "@supabase/supabase-js";

// Real clinic-side "Solicitudes de cita" data — public.appointment_requests
// (see its migration). A Solicitud is a SEPARATE entity from a Cita, with
// its own lifecycle (Pendiente → Aceptada / Rechazada); it never appears on
// the Agenda board, never occupies a slot, and only produces a real
// `appointments` row when the clinic accepts it.
//
// No clinic/role filtering is done here beyond `clinic_id`: RLS
// (appointment_requests_select_staff) already scopes this to exactly what
// the caller may see — clinic_admin/assistant across the whole clinic, a
// dentist only for requests naming their OWN professional_profile — reusing
// can_access_appointment(), the same helper that governs the resulting
// Cita. Same "sequential queries merged in JS" convention as
// appointments-data.ts: patient_id is only ever a COMPOSITE FK, so there's
// no plain FK PostgREST could embed through.

export type AppointmentRequestStatus = "pending" | "accepted" | "rejected";

export type AppointmentRequest = {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  professionalProfileId: string;
  preferredStartsAt: string;
  status: AppointmentRequestStatus;
  acceptedAppointmentId: string | null;
  createdAt: string;
};

type RequestRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_profile_id: string;
  preferred_starts_at: string;
  status: AppointmentRequestStatus;
  accepted_appointment_id: string | null;
  created_at: string;
};

const REQUEST_COLUMNS =
  "id, clinic_id, patient_id, professional_profile_id, preferred_starts_at, status, accepted_appointment_id, created_at";

async function mapRows(supabase: SupabaseClient, rows: RequestRow[]): Promise<AppointmentRequest[]> {
  if (rows.length === 0) return [];
  const patientIds = [...new Set(rows.map((r) => r.patient_id))];
  const { data, error } = await supabase.from("patients").select("id, first_name, last_name, phone").in("id", patientIds);
  if (error) throw error;
  const patientById = new Map((data ?? []).map((p) => [p.id, p]));

  return rows.map((row) => {
    const patient = patientById.get(row.patient_id);
    return {
      id: row.id,
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Paciente",
      patientPhone: patient?.phone ?? null,
      professionalProfileId: row.professional_profile_id,
      preferredStartsAt: row.preferred_starts_at,
      status: row.status,
      acceptedAppointmentId: row.accepted_appointment_id,
      createdAt: row.created_at,
    };
  });
}

// Pending only — the actionable set. Accepted/rejected requests stay in the
// table (they're the audit trail, and the Patient Portal shows her own
// resolved ones), but the clinic's surface is a work queue, not a log.
export async function fetchPendingAppointmentRequests(
  supabase: SupabaseClient,
  clinicId: string,
): Promise<AppointmentRequest[]> {
  const { data, error } = await supabase
    .from("appointment_requests")
    .select(REQUEST_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return mapRows(supabase, (data as RequestRow[] | null) ?? []);
}
