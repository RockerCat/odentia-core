import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClinicTeamMemberRow, ClinicTeamRole } from "./clinic-profile";

type Row = {
  clinic_id: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: ClinicTeamRole;
  professional_profile_id: string | null;
  license_number: string | null;
  specialty_name: string | null;
};

// get_my_clinic_team() (migration 20260925120000) — the active team of the
// CALLER's own clinic, scoped server-side through her patient_user_links.
export async function fetchMyClinicTeam(supabase: SupabaseClient): Promise<ClinicTeamMemberRow[]> {
  const { data, error } = await supabase.rpc("get_my_clinic_team");
  if (error) throw error;
  return ((data as Row[] | null) ?? []).map((r) => ({
    clinicId: r.clinic_id,
    profileId: r.profile_id,
    firstName: r.first_name,
    lastName: r.last_name,
    avatarUrl: r.avatar_url,
    role: r.role,
    professionalProfileId: r.professional_profile_id,
    licenseNumber: r.license_number,
    specialtyName: r.specialty_name,
  }));
}
