import type { SupabaseClient } from "@supabase/supabase-js";
import type { PatientContext, PatientInfo, PatientClinic, Profile } from "./types";

// Single source of truth for "who is this real Supabase user, as a
// Patient" — the Portal's own counterpart to resolve-clinic-context.ts.
// Used by the real Portal gate (src/lib/supabase/proxy.ts), the real
// /login redirect, and the Portal shell's own display identity. Takes an
// already-constructed SupabaseClient so the exact same query logic runs
// unchanged from the browser, a Server Component, or the proxy.
//
// The ONLY connection from an authenticated account to a patient record is
// patient_user_links (foundation schema's own comment: "created solely by
// consuming a valid patient_access_invitations token, never by identity
// matching") — never patient_id/clinic_id from a client, never matching by
// email. There is no separate patient_profiles table in this schema: the
// patient's own identity record IS public.patients.
export async function resolvePatientContext(supabase: SupabaseClient): Promise<PatientContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  // patient_user_links_select_self (foundation RLS) is what makes this
  // visible at all — scoped to the caller's own profile_id, never a
  // client-supplied patient_id/clinic_id of any kind. patients.clinic_id
  // and clinics are both plain (non-composite) FKs, same embed pattern
  // resolve-clinic-context.ts already uses for clinic_memberships →
  // clinics.
  const { data: links, error: linksError } = await supabase
    .from("patient_user_links")
    .select(
      "patient_id, patient:patients(id, first_name, last_name, email, phone, document_id, birth_date, clinic_id, clinic:clinics(id, name, slug, logo_url, phone, status))",
    )
    .eq("profile_id", user.id);
  if (linksError) throw linksError;

  if (!links || links.length === 0) return { status: "not-linked" };
  // Never silently pick one — same "no selector UI yet, surface it
  // explicitly" rule as resolve-clinic-context.ts's own
  // "multiple-memberships". patient_user_links caps ONE linked account per
  // patient record (unique on patient_id), never one patient per account,
  // so the same real person can legitimately be a patient at more than one
  // clinic — see types.ts's own comment on PatientContext.
  if (links.length > 1) return { status: "multiple-links" };

  const row = links[0];
  const patientRow = Array.isArray(row.patient) ? row.patient[0] : row.patient;
  // patients_select_own_via_link should always resolve this alongside the
  // link itself; null here would mean the patient row is unexpectedly
  // unreadable (e.g. deleted out from under an existing link) — reads as
  // "not linked" rather than throwing, same honest-fallback spirit as
  // resolve-clinic-context.ts's own null-clinic-row guard.
  if (!patientRow) return { status: "not-linked" };

  const clinicRow = Array.isArray(patientRow.clinic) ? patientRow.clinic[0] : patientRow.clinic;
  if (!clinicRow) return { status: "not-linked" };
  if (clinicRow.status === "suspended") return { status: "clinic-suspended" };

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profileRow) return { status: "unauthenticated" };

  const profile: Profile = {
    id: profileRow.id,
    firstName: profileRow.first_name,
    lastName: profileRow.last_name,
    email: profileRow.email,
    avatarUrl: profileRow.avatar_url,
  };
  const patient: PatientInfo = {
    id: patientRow.id,
    firstName: patientRow.first_name,
    lastName: patientRow.last_name,
    email: patientRow.email,
    phone: patientRow.phone,
    documentId: patientRow.document_id,
    birthDate: patientRow.birth_date,
    clinicId: patientRow.clinic_id,
  };
  const clinic: PatientClinic = {
    id: clinicRow.id,
    name: clinicRow.name,
    slug: clinicRow.slug,
    logoUrl: clinicRow.logo_url,
    phone: clinicRow.phone,
    status: clinicRow.status,
  };

  return { status: "ok", profile, patient, clinic };
}
