import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAppointmentsForPatient, type Appointment } from "@/features/dashboard/appointments-data";

// Real /portal/citas data — reuses fetchAppointmentsForPatient (already
// scoped by clinic_id + patient_id, both resolved server-side via
// resolvePatientContext, never client-supplied) rather than a second
// appointments query, per CLAUDE.md's "avoid duplicated logic". That query
// alone is enough for the Cita's own fields; this file only adds what it
// doesn't carry: the treating professional's display info (name/avatar/
// specialty/registro), via get_my_appointment_professionals — a SECURITY
// DEFINER RPC, because professional_profiles/clinic_memberships/profiles are
// all staff-only for SELECT (see that RPC's own migration comment for why
// this isn't instead a couple of new patient-readable RLS policies on those
// tables). Same "sequential queries merged in JS" convention as
// fetchClinicalProfessionals/fetchTeamMembers — professional_profile_id has
// no plain FK PostgREST could embed through anyway.

export type PortalAppointment = Appointment & {
  professionalName: string;
  professionalAvatarUrl: string | null;
  professionalSpecialty: string | null;
  professionalLicenseNumber: string | null;
};

type ProfessionalRow = {
  professional_profile_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  license_number: string | null;
  specialty_name: string | null;
};

export async function fetchMyAppointments(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<PortalAppointment[]> {
  const appointments = await fetchAppointmentsForPatient(supabase, clinicId, patientId);
  if (appointments.length === 0) return [];

  const professionalProfileIds = [...new Set(appointments.map((a) => a.professionalProfileId))];
  const { data, error } = await supabase.rpc("get_my_appointment_professionals", {
    p_professional_profile_ids: professionalProfileIds,
  });
  if (error) throw error;
  const professionalById = new Map((data as ProfessionalRow[] | null ?? []).map((row) => [row.professional_profile_id, row]));

  return appointments.map((a) => {
    const professional = professionalById.get(a.professionalProfileId);
    const name = professional ? `${professional.first_name} ${professional.last_name}`.trim() : "Profesional";
    return {
      ...a,
      professionalName: name,
      professionalAvatarUrl: professional?.avatar_url ?? null,
      professionalSpecialty: professional?.specialty_name ?? null,
      professionalLicenseNumber: professional?.license_number ?? null,
    };
  });
}
