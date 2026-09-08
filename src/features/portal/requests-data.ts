import type { SupabaseClient } from "@supabase/supabase-js";

// Real "Solicitud de Cita" data for the Patient Portal — a SEPARATE entity
// from `Cita` (see CLAUDE.md's Appointment Lifecycle and the
// appointment_requests migration): a request never is, never becomes and
// never occupies an appointment. Its own lifecycle is only
// Pendiente → Aceptada / Rechazada.
//
// Reads go straight through RLS (appointment_requests_select_own_via_patient_link,
// scoped by the caller's own patient_user_links row — never a
// client-supplied patient_id/clinic_id). The professional's display info
// can't come from the same query: professional_profiles/clinic_memberships/
// profiles are all staff-only for SELECT, so it comes from
// get_my_clinic_professionals — the same narrow SECURITY DEFINER shape
// get_my_appointment_professionals already established for exactly this
// reason (see that RPC's own migration comment).

export type AppointmentRequestStatus = "pending" | "accepted" | "rejected";

export type PortalProfessional = {
  professionalProfileId: string;
  name: string;
  avatarUrl: string | null;
  specialty: string | null;
  licenseNumber: string | null;
};

export type PortalAppointmentRequest = {
  id: string;
  professionalProfileId: string;
  professionalName: string;
  preferredStartsAt: string;
  status: AppointmentRequestStatus;
  acceptedAppointmentId: string | null;
  createdAt: string;
};

type ProfessionalRow = {
  professional_profile_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  license_number: string | null;
  specialty_name: string | null;
};

type RequestRow = {
  id: string;
  professional_profile_id: string;
  preferred_starts_at: string;
  status: AppointmentRequestStatus;
  accepted_appointment_id: string | null;
  created_at: string;
};

export function toPortalProfessional(row: ProfessionalRow): PortalProfessional {
  return {
    professionalProfileId: row.professional_profile_id,
    name: `${row.first_name} ${row.last_name}`.trim() || "Profesional",
    avatarUrl: row.avatar_url,
    specialty: row.specialty_name,
    licenseNumber: row.license_number,
  };
}

// Every professional the patient's OWN clinic can actually be booked with —
// mirrors Agenda's own fetchClinicalProfessionals (active professional
// profile + active clinical membership), so the Portal never offers a
// professional the clinic itself wouldn't show as a column.
export async function fetchMyClinicProfessionals(supabase: SupabaseClient): Promise<PortalProfessional[]> {
  const { data, error } = await supabase.rpc("get_my_clinic_professionals");
  if (error) throw error;
  return ((data as ProfessionalRow[] | null) ?? []).map(toPortalProfessional);
}

export async function fetchMyAppointmentRequests(
  supabase: SupabaseClient,
  professionals: PortalProfessional[],
): Promise<PortalAppointmentRequest[]> {
  const { data, error } = await supabase
    .from("appointment_requests")
    .select("id, professional_profile_id, preferred_starts_at, status, accepted_appointment_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const nameById = new Map(professionals.map((p) => [p.professionalProfileId, p.name]));
  return ((data as RequestRow[] | null) ?? []).map((row) => ({
    id: row.id,
    professionalProfileId: row.professional_profile_id,
    // A professional who has since been deactivated is no longer in the
    // bookable list, but her past request must still render — honest
    // fallback, never a fabricated name.
    professionalName: nameById.get(row.professional_profile_id) ?? "Profesional",
    preferredStartsAt: row.preferred_starts_at,
    status: row.status,
    acceptedAppointmentId: row.accepted_appointment_id,
    createdAt: row.created_at,
  }));
}

export const REQUEST_STATUS_LABELS: Record<AppointmentRequestStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
};

// Same palette tokens the real Cita statuses already use (real-status.ts's
// REAL_STATUS_STYLES) — a Solicitud is a different lifecycle, not a
// different design language.
export const REQUEST_STATUS_STYLES: Record<AppointmentRequestStatus, string> = {
  pending: "border-warning/25 bg-warning/10 text-warning",
  accepted: "border-primary/25 bg-primary/10 text-primary",
  rejected: "border-danger/20 bg-danger/5 text-danger/70",
};
