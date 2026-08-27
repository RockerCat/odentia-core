import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTeamMembers } from "@/features/clinic/data";

export type UpdatedByProfessional = {
  name: string;
  avatarUrl: string | null;
  specialtyName: string | null;
};

// Resolves patient_medical_histories.updated_by (a profiles.id) to a real
// display name/avatar/specialty for the Antecedentes metadata line — see
// antecedentes-tab.tsx. Reuses fetchTeamMembers (already correctly joins
// clinic_memberships + profiles + professional_profiles + specialties,
// see src/features/clinic/data.ts) instead of a second, duplicated
// multi-query merge — this clinic's own team list already contains
// exactly the row we need. Returns null if the profile can't be resolved
// as a current member of this clinic (e.g. their membership ended) —
// callers fall back to showing only the date, never an invented name.
export async function resolveUpdatedByProfessional(
  supabase: SupabaseClient,
  clinicId: string,
  profileId: string,
): Promise<UpdatedByProfessional | null> {
  const members = await fetchTeamMembers(supabase, clinicId);
  const member = members.find((m) => m.profileId === profileId);
  if (!member) return null;

  const name = `${member.firstName} ${member.lastName}`.trim();
  if (!name) return null;

  return {
    name,
    avatarUrl: member.avatarUrl,
    specialtyName: member.professionalProfile?.specialtyName ?? null,
  };
}
