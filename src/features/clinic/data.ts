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
  createdAt: string;
  // Pilot subscription controls (src/features/subscription/) — null for
  // any clinic provisioned before that checkpoint, never backfilled with
  // an invented date. Used by Mi Suscripción; harmless additive field for
  // every other existing caller of fetchClinicDetail.
  trialEndsAt: string | null;
};

export async function fetchClinicDetail(supabase: SupabaseClient, clinicId: string): Promise<ClinicDetail | null> {
  const { data, error } = await supabase
    .from("clinics")
    .select("id, name, legal_name, tax_id, email, phone, logo_url, status, created_at, trial_ends_at")
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
    createdAt: data.created_at,
    trialEndsAt: data.trial_ends_at,
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
  // RIPS #3 — Documento Técnico 1 C01/P01 codPrestador (código de
  // habilitación REPS), un dato por sede, ver la migración que agrega
  // esta columna para la cita regulatoria completa.
  codPrestador: string | null;
};

// bootstrap_clinic() always creates exactly one is_primary location — see
// the bootstrap RPC migration — but this stays null-safe (see task scope,
// section 12) rather than assuming that row always exists.
export async function fetchPrimaryLocation(supabase: SupabaseClient, clinicId: string): Promise<PrimaryLocation | null> {
  const { data, error } = await supabase
    .from("clinic_locations")
    .select("id, name, address, city, state, country, phone, timezone, latitude, longitude, cod_prestador")
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
    codPrestador: data.cod_prestador,
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
    // Both the resolved display name AND the raw id — Mi perfil
    // profesional's own edit form (see clinic-settings-screen.tsx) needs
    // the id to preselect the current specialty in its picker; every other
    // read-only consumer (Equipo's own roleLabel) keeps using the name.
    specialtyId: string | null;
    specialtyName: string | null;
    defaultAppointmentDurationMinutes: number | null;
    bio: string | null;
    // RIPS #3 — official TipoDocumento catalog code + national ID number,
    // a genuine pair (never a single "CC 123456" string). Nullable: not
    // every existing professional_profile has these set yet.
    documentType: string | null;
    documentNumber: string | null;
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
    .select(
      "id, active, license_number, clinic_membership_id, default_appointment_duration_minutes, bio, primary_specialty_id, document_type, document_number",
    )
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
        specialtyId: pp.primary_specialty_id,
        specialtyName: pp.primary_specialty_id ? (specialtyNameById.get(pp.primary_specialty_id) ?? null) : null,
        defaultAppointmentDurationMinutes: pp.default_appointment_duration_minutes,
        bio: pp.bio,
        documentType: pp.document_type,
        documentNumber: pp.document_number,
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

// Invitaciones pendientes — a SEPARATE list from TeamMember above: a
// clinic_invitations row never becomes a TeamMember until
// accept_clinic_invitation() actually creates the clinic_membership (see
// that RPC). Deliberately selects only non-sensitive columns — never
// token_hash, which must never reach the client (see regenerate-invitation
// migration's own comments and team-actions.ts's own rule on this).
// status is always 'pending' here (query-filtered), same explicit column
// invite_clinic_member/accept_clinic_invitation already use as the single
// source of truth for invitation state — never a derived/reinterpreted
// value.
export type PendingInvitation = {
  id: string;
  email: string;
  role: TeamMemberRole;
  status: "pending";
  expiresAt: string;
};

export async function fetchPendingInvitations(supabase: SupabaseClient, clinicId: string): Promise<PendingInvitation[]> {
  const result = await supabase
    .from("clinic_invitations")
    .select("id, email, role, status, expires_at")
    .eq("clinic_id", clinicId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (result.error) {
    logStepFailed("fetchPendingInvitations", result.error);
    throw result.error;
  }
  return result.data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: "pending" as const,
    expiresAt: row.expires_at,
  }));
}

export type Specialty = { id: string; name: string };

// The global catalog (specialties is NOT clinic-scoped — see the
// foundation schema) — backs Mi perfil profesional's own specialty picker
// (see clinic-settings-screen.tsx), same active-only/name-ordered
// convention as fetchActiveTreatmentNames/fetchActiveRoomNames.
export async function fetchActiveSpecialties(supabase: SupabaseClient): Promise<Specialty[]> {
  const { data, error } = await supabase
    .from("specialties")
    .select("id, name")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) {
    logStepFailed("fetchActiveSpecialties (specialties)", error);
    throw error;
  }
  return data ?? [];
}

// RIPS #A4 — the specialties actually relevant to THIS clinic, unlike
// fetchActiveSpecialties above (the full global catalog, used only for
// "Mi perfil profesional"'s own picker). "Servicios RIPS por especialidad"
// must never list a specialty no active professional of this clinic
// actually practices — showing the full global catalog there would bury
// the 1-3 specialties that matter under dozens of irrelevant ones. Same
// two-sequential-queries-merged-in-JS convention as fetchTeamMembers above
// (professional_profiles.primary_specialty_id has no direct embeddable FK
// to specialties worth relying on here either) — deduplicated by specialty
// id, since more than one active professional can share the same primary
// specialty.
export async function fetchClinicRelevantSpecialties(supabase: SupabaseClient, clinicId: string): Promise<Specialty[]> {
  const professionalProfilesResult = await supabase
    .from("professional_profiles")
    .select("primary_specialty_id")
    .eq("clinic_id", clinicId)
    .eq("active", true);
  if (professionalProfilesResult.error) {
    logStepFailed("fetchClinicRelevantSpecialties (professional_profiles)", professionalProfilesResult.error);
    throw professionalProfilesResult.error;
  }

  const specialtyIds = [
    ...new Set(
      professionalProfilesResult.data.map((pp) => pp.primary_specialty_id).filter((id): id is string => id !== null),
    ),
  ];
  if (specialtyIds.length === 0) return [];

  const specialtiesResult = await supabase
    .from("specialties")
    .select("id, name")
    .in("id", specialtyIds)
    .order("name", { ascending: true });
  if (specialtiesResult.error) {
    logStepFailed("fetchClinicRelevantSpecialties (specialties)", specialtiesResult.error);
    throw specialtiesResult.error;
  }
  return specialtiesResult.data ?? [];
}
