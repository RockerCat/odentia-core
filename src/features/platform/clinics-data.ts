import type { SupabaseClient } from "@supabase/supabase-js";

export type PlatformClinicListItem = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  city: string | null;
  createdAt: string;
};

export type PlatformClinicDetail = {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  status: "active" | "suspended";
  createdAt: string;
  location: {
    address: string | null;
    city: string | null;
    state: string | null;
  } | null;
};

// Matches any RFC 4122-shaped UUID, case-insensitively — the one pure,
// directly testable piece of the slug/UUID-compatibility logic (see
// .../clinicas/[slug]/page.tsx, the only real caller). Deciding whether a
// URL segment is worth an id-column lookup at all belongs next to the
// fetchers it gates, not inline in a page component — a lookup miss for
// an arbitrary non-UUID string must never reach clinics.id (a real `uuid`
// column), which would otherwise throw Postgres' "invalid input syntax
// for type uuid" instead of a clean not-found.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeClinicId(value: string): boolean {
  return UUID_RE.test(value);
}

type RawClinicLocation = { city: string | null; is_primary: boolean };
type RawClinicDetailLocation = { address: string | null; city: string | null; state: string | null; is_primary: boolean };

function findPrimary<T extends { is_primary: boolean }>(locations: T[] | null | undefined): T | null {
  const list = locations ?? [];
  return list.find((location) => location.is_primary) ?? list[0] ?? null;
}

// Real Platform (Superadmin) read of EVERY clinic in the system — never
// scoped to the caller's own membership the way resolveClinicContext()'s
// own clinic_memberships query is (a Superadmin has none). Safe under
// RLS: clinics_select_member_or_superadmin / clinic_locations_select_
// member_or_superadmin (foundation RLS migration) already let
// is_platform_superadmin() see every row, and both tables already carry
// their base GRANT SELECT TO authenticated
// (20260826153000_grant_onboarding_table_privileges.sql /
// 20260828100000_grant_clinic_screen_select_update.sql) — verified
// directly against every migration ever applied, not assumed, given the
// platform_roles incident this same initiative already went through once.
export async function fetchPlatformClinics(supabase: SupabaseClient): Promise<PlatformClinicListItem[]> {
  const { data, error } = await supabase
    .from("clinics")
    .select("id, name, slug, status, created_at, clinic_locations(city, is_primary)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const primary = findPrimary<RawClinicLocation>(row.clinic_locations);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      city: primary?.city ?? null,
      createdAt: row.created_at,
    };
  });
}

const CLINIC_DETAIL_SELECT =
  "id, name, slug, legal_name, tax_id, email, phone, status, created_at, clinic_locations(address, city, state, is_primary)";

function mapClinicDetailRow(data: {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  status: "active" | "suspended";
  created_at: string;
  clinic_locations: RawClinicDetailLocation[] | null;
}): PlatformClinicDetail {
  const primary = findPrimary<RawClinicDetailLocation>(data.clinic_locations);

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    legalName: data.legal_name,
    taxId: data.tax_id,
    email: data.email,
    phone: data.phone,
    status: data.status,
    createdAt: data.created_at,
    location: primary ? { address: primary.address, city: primary.city, state: primary.state } : null,
  };
}

// The canonical Platform lookup — `slug` is the public/canonical URL for
// a clinic within Platform (see .../clinicas/[slug]/page.tsx, the only
// real caller of this function). `clinics.slug` is `not null` + `unique`
// (foundation schema) and has never been writable after creation (no
// screen ever updates it — see the read-only audit that confirmed this),
// so this lookup is stable even if the clinic's own `name` changes later.
export async function fetchPlatformClinicBySlug(supabase: SupabaseClient, slug: string): Promise<PlatformClinicDetail | null> {
  const { data, error } = await supabase.from("clinics").select(CLINIC_DETAIL_SELECT).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return mapClinicDetailRow(data);
}

export type ActiveClinicAdminMembership = {
  id: string;
  profileId: string;
  joinedAt: string | null;
};

// "Platform — Asignar primer Administrador de Clínica" (Estado A/C).
// clinic_memberships_select_member_or_superadmin (foundation RLS
// migration) already lets is_platform_superadmin() see every row, and the
// table already carries its base GRANT SELECT TO authenticated — verified
// directly against the migration, same discipline as fetchPlatformClinics
// above.
//
// A clinic can have MORE THAN ONE active clinic_admin (product decision,
// "Platform → Clínica → Equipo" — the "first admin" concept only governs
// the bootstrap RPC's own guards, never a cap on how many can exist
// afterward) — this only ever needs to know "does at least one exist" to
// decide Estado A vs C, so `.limit(1)` + take the first row, exactly the
// same defensive pattern fetchPendingClinicAdminInvitation() below
// already uses, and for the identical reason: `.maybeSingle()` throws a
// real PostgREST error ("multiple (or no) rows returned") the moment a
// clinic legitimately has two or more, which is exactly the refresh
// regression this comment now documents — a Superadmin's OWN
// clinic_memberships row is invisible here (RLS never grants her one
// against her own profile_id, she isn't a member), so this can only ever
// return real staff rows, never accidentally her own.
export async function fetchActiveClinicAdminMembership(
  supabase: SupabaseClient,
  clinicId: string,
): Promise<ActiveClinicAdminMembership | null> {
  const { data, error } = await supabase
    .from("clinic_memberships")
    .select("id, profile_id, joined_at")
    .eq("clinic_id", clinicId)
    .eq("role", "clinic_admin")
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1);
  if (error) throw error;

  const row = data?.[0];
  if (!row) return null;

  return { id: row.id, profileId: row.profile_id, joinedAt: row.joined_at };
}

export type StaffIdentity = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};

// Estado C's "who is this admin" — a SEPARATE, sequential query from
// fetchActiveClinicAdminMembership() above, never a PostgREST embed: this
// codebase deliberately avoids cross-table embeds after a past regression
// (see fetchTeamMembers()'s own comment in src/features/clinic/data.ts —
// "queries simples y aburridas", each table's failure diagnosed on its
// own). Only reachable for a Superadmin since 20260916170000 added
// `or is_platform_superadmin()` to profiles_select_self_or_clinicmate —
// profiles already carries a table-wide GRANT SELECT TO authenticated
// (20260827130000), so no column-grant change was needed for this read.
export async function fetchProfileIdentity(supabase: SupabaseClient, profileId: string): Promise<StaffIdentity | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, phone")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return { firstName: data.first_name, lastName: data.last_name, email: data.email, phone: data.phone };
}

export type PendingClinicAdminInvitation = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  expiresAt: string;
};

// Estado B — a clinic_admin invitation that is still `pending` and not
// yet expired. Same "pending and not expired" condition
// provision_first_clinic_admin_invitation() (20260916150000) itself uses
// to reject a second invitation — never re-derived differently here, so
// Platform's own read can never disagree with what the RPC will actually
// accept/reject. Deliberately does NOT flip a lapsed `pending` row to
// `expired` (that write — and its own known rollback bug — stays out of
// scope here); an expired-but-still-`pending` row simply falls through
// this filter and this function returns null, which correctly routes the
// page to Estado A instead.
//
// Reachable for a Superadmin since 20260916170000 added
// `or is_platform_superadmin()` to clinic_invitations_select_admin, and
// the same migration's column grant added first_name/last_name/phone to
// what fetchPendingInvitations() (src/features/clinic/data.ts) already
// had granted (id/clinic_id/email/role/status/expires_at/created_at) —
// never token_hash/invited_by/accepted_membership_id, none of which this
// query selects.
//
// .limit(1) + take the first row, not .maybeSingle(): the "only one live
// clinic_admin invitation per clinic" rule is an application-level guard
// inside the RPC (no partial unique index backs it), so this stays
// defensive against a theoretical race rather than throwing on more than
// one row.
export async function fetchPendingClinicAdminInvitation(
  supabase: SupabaseClient,
  clinicId: string,
): Promise<PendingClinicAdminInvitation | null> {
  const { data, error } = await supabase
    .from("clinic_invitations")
    .select("id, email, first_name, last_name, phone, expires_at")
    .eq("clinic_id", clinicId)
    .eq("role", "clinic_admin")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  const row = data?.[0];
  if (!row) return null;

  return { id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name, phone: row.phone, expiresAt: row.expires_at };
}

// UUID-compatibility lookup only — kept for a link minted before
// slug-based URLs existed (e.g. this checkpoint's own QA smoke, which
// redirected to a raw clinic_id). The only real caller (.../clinicas/
// [slug]/page.tsx) checks the segment looks like a UUID before ever
// calling this, so a plain slug lookup miss never reaches here and never
// throws Postgres' "invalid input syntax for type uuid".
export async function fetchPlatformClinicById(supabase: SupabaseClient, clinicId: string): Promise<PlatformClinicDetail | null> {
  const { data, error } = await supabase.from("clinics").select(CLINIC_DETAIL_SELECT).eq("id", clinicId).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return mapClinicDetailRow(data);
}
