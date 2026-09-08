import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTeamMembers } from "@/features/clinic/data";

export type UpdatedByProfessional = {
  name: string;
  avatarUrl: string | null;
  specialtyName: string | null;
};

type ClinicalRecordAuthorRow = {
  profile_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  specialty_name: string | null;
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
//
// Also the ONE Portal read path for the same metadata (Mi Historia
// Clínica reuses Antecedentes/Odontograma/Atenciones/Documentos/Resumen
// as-is — see patient-medical-record-screen.tsx) — but
// clinic_memberships/professional_profiles/profiles are ALL staff-only
// for SELECT, so a Patient caller's fetchTeamMembers() always comes back
// `[]` (RLS silently filters every row, never an error). `members.length
// > 0` is therefore a reliable "this caller has real staff-level access"
// signal: it's always true for any real clinic (every clinic has at
// least its founding clinic_admin), so a genuine staff caller never falls
// through to the RPC below. Only a caller with NO staff access at all —
// i.e. a Patient — ever reaches get_my_clinical_record_authors(), the
// same narrow SECURITY DEFINER shape get_my_appointment_professionals/
// get_my_clinic_professionals already established (see that RPC's own
// migration comment).
export async function resolveUpdatedByProfessional(
  supabase: SupabaseClient,
  clinicId: string,
  profileId: string,
): Promise<UpdatedByProfessional | null> {
  const members = await fetchTeamMembers(supabase, clinicId);
  if (members.length > 0) {
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

  const { data, error } = await supabase.rpc("get_my_clinical_record_authors");
  if (error) return null;
  const row = ((data as ClinicalRecordAuthorRow[] | null) ?? []).find((r) => r.profile_id === profileId);
  if (!row) return null;
  const name = `${row.first_name} ${row.last_name}`.trim();
  if (!name) return null;
  return { name, avatarUrl: row.avatar_url, specialtyName: row.specialty_name };
}
