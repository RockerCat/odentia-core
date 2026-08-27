import type { SupabaseClient } from "@supabase/supabase-js";
import { logStepFailed } from "./debug";

// Real /clinica data — takes an already-constructed SupabaseClient (same
// convention as src/features/session/resolve-clinic-context.ts) so the
// exact same query logic runs unchanged from the Server Component
// (src/app/clinica/page.tsx, the server-first initial load) or a Client
// Component refetch after an edit. clinic_id always comes from
// CurrentUserContext (resolveClinicContext) — never accepted from a URL or
// form as its own source of authority (see CLAUDE.md task scope, section 15).

export type ClinicDetail = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  logoUrl: string | null;
  status: "active" | "suspended";
};

export async function fetchClinicDetail(supabase: SupabaseClient, clinicId: string): Promise<ClinicDetail | null> {
  const { data, error } = await supabase
    .from("clinics")
    .select("id, name, legal_name, tax_id, email, phone, logo_url, status")
    .eq("id", clinicId)
    .maybeSingle();
  if (error) {
    logStepFailed("fetchClinicDetail (clinics)", error);
    throw error;
  }
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    legalName: data.legal_name,
    taxId: data.tax_id,
    email: data.email,
    phone: data.phone,
    logoUrl: data.logo_url,
    status: data.status,
  };
}

export type PrimaryLocation = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  phone: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
};

// bootstrap_clinic() always creates exactly one is_primary location — see
// the bootstrap RPC migration — but this stays null-safe (see task scope,
// section 12) rather than assuming that row always exists.
export async function fetchPrimaryLocation(supabase: SupabaseClient, clinicId: string): Promise<PrimaryLocation | null> {
  const { data, error } = await supabase
    .from("clinic_locations")
    .select("id, name, address, city, state, country, phone, timezone, latitude, longitude")
    .eq("clinic_id", clinicId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) {
    logStepFailed("fetchPrimaryLocation (clinic_locations)", error);
    throw error;
  }
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    address: data.address,
    city: data.city,
    state: data.state,
    country: data.country,
    phone: data.phone,
    timezone: data.timezone,
    latitude: data.latitude,
    longitude: data.longitude,
  };
}

export type TeamMemberRole = "clinic_admin" | "dentist" | "assistant";
export type TeamMemberStatus = "active" | "suspended" | "inactive";

export type TeamMember = {
  membershipId: string;
  profileId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  // Identity/role always come from clinic_memberships + profiles — this is
  // additive, never a second source of role/identity (see CLAUDE.md task
  // scope, section 6).
  professionalProfile: {
    id: string;
    active: boolean;
    licenseNumber: string | null;
    specialtyName: string | null;
    defaultAppointmentDurationMinutes: number | null;
    bio: string | null;
  } | null;
};

// One row per real clinic_membership — a Clinic Admin who also has a
// professional_profile (the "Administrador Odontólogo" scenario, see task
// scope section 7) is naturally a single row here with both role and
// professionalProfile set; there is no separate "dentist entry" to
// deduplicate, unlike the old mock TEAM_DENTISTS/TEAM_ASSISTANTS split.
//
// Four fully independent, sequential queries — no embeds at all — merged
// in JS. A previous version embedded professional_profiles under
// clinic_memberships in one PostgREST select, which broke because
// professional_profiles.clinic_membership_id has no standalone
// single-column FK to clinic_memberships (the only constraint touching it
// is the COMPOSITE foreign key (clinic_membership_id, clinic_id)
// references clinic_memberships (id, clinic_id) — see the foundation
// schema migration). Fixing that alone didn't fully resolve the reported
// failure, so this pass drops every remaining embed too (profile:profiles,
// specialty:specialties) — not because they were proven broken, but so a
// failure in any one of the four tables involved (clinic_memberships,
// profiles, professional_profiles, specialties) is diagnosed on its own,
// never masked as a generic "fetchTeamMembers failed" (see task scope:
// "queries simples y aburridas" over a clever combined one).
export async function fetchTeamMembers(supabase: SupabaseClient, clinicId: string): Promise<TeamMember[]> {
  const membershipsResult = await supabase
    .from("clinic_memberships")
    .select("id, profile_id, role, status")
    .eq("clinic_id", clinicId);
  if (membershipsResult.error) {
    logStepFailed("fetchTeamMembers (clinic_memberships)", membershipsResult.error);
    throw membershipsResult.error;
  }
  const memberships = membershipsResult.data;

  const profileIds = memberships.map((m) => m.profile_id);
  const profilesResult = profileIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, email, avatar_url").in("id", profileIds)
    : { data: [] as { id: string; first_name: string; last_name: string; email: string; avatar_url: string | null }[], error: null };
  if (profilesResult.error) {
    logStepFailed("fetchTeamMembers (profiles)", profilesResult.error);
    throw profilesResult.error;
  }
  const professionalProfilesResult = await supabase
    .from("professional_profiles")
    .select("id, active, license_number, clinic_membership_id, default_appointment_duration_minutes, bio, primary_specialty_id")
    .eq("clinic_id", clinicId);
  if (professionalProfilesResult.error) {
    logStepFailed("fetchTeamMembers (professional_profiles)", professionalProfilesResult.error);
    throw professionalProfilesResult.error;
  }
  const professionalProfiles = professionalProfilesResult.data;

  const specialtyIds = professionalProfiles
    .map((pp) => pp.primary_specialty_id)
    .filter((id): id is string => id !== null);
  const specialtiesResult = specialtyIds.length
    ? await supabase.from("specialties").select("id, name").in("id", specialtyIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (specialtiesResult.error) {
    logStepFailed("fetchTeamMembers (specialties)", specialtiesResult.error);
    throw specialtiesResult.error;
  }
  const profileById = new Map(profilesResult.data.map((p) => [p.id, p]));
  const specialtyNameById = new Map(specialtiesResult.data.map((s) => [s.id, s.name]));
  const professionalByMembershipId = new Map(
    professionalProfiles.map((pp) => [
      pp.clinic_membership_id as string,
      {
        id: pp.id,
        active: pp.active,
        licenseNumber: pp.license_number,
        specialtyName: pp.primary_specialty_id ? (specialtyNameById.get(pp.primary_specialty_id) ?? null) : null,
        defaultAppointmentDurationMinutes: pp.default_appointment_duration_minutes,
        bio: pp.bio,
      },
    ]),
  );

  return memberships.map((row) => {
    const profile = profileById.get(row.profile_id);
    return {
      membershipId: row.id,
      profileId: row.profile_id,
      firstName: profile?.first_name ?? "",
      lastName: profile?.last_name ?? "",
      email: profile?.email ?? "",
      avatarUrl: profile?.avatar_url ?? null,
      role: row.role,
      status: row.status,
      professionalProfile: professionalByMembershipId.get(row.id) ?? null,
    };
  });
}
