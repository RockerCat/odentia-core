import type { SupabaseClient } from "@supabase/supabase-js";

// Real /pacientes data — takes an already-constructed SupabaseClient (same
// convention as src/features/session/resolve-clinic-context.ts and
// src/features/clinic/data.ts) so the exact same query logic runs
// unchanged from the Server Component (src/app/pacientes/page.tsx, the
// server-first initial load) or a Client Component refetch. clinic_id
// always comes from CurrentUserContext (resolveClinicContext) — never
// accepted from a URL/form as its own source of authority.
//
// public.patients is the only real table backing this feature today (see
// the foundation schema migration) — id, clinic_id, first_name, last_name,
// document_id, phone, email, birth_date, active, created_at, updated_at.
// No dentist assignment column (patients belong to the Clinic, not a
// Dentist — see CLAUDE.md Domain Model), no appointment/clinical columns
// at all (appointments/historia clínica/odontograma are explicitly out of
// scope for the foundation schema).

export type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  active: boolean;
  createdAt: string;
};

function mapRow(row: {
  id: string;
  first_name: string;
  last_name: string;
  document_id: string | null;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  active: boolean;
  created_at: string;
}): Patient {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    documentId: row.document_id,
    phone: row.phone,
    email: row.email,
    birthDate: row.birth_date,
    active: row.active,
    createdAt: row.created_at,
  };
}

const PATIENT_COLUMNS = "id, first_name, last_name, document_id, phone, email, birth_date, active, created_at";

export async function fetchPatients(supabase: SupabaseClient, clinicId: string): Promise<Patient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_COLUMNS)
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

// clinic_id is redundant with RLS (patients_select_member already scopes
// to the caller's own clinic membership) — kept as an explicit second
// check anyway, so a UUID belonging to another clinic returns null (→ the
// page's notFound()) rather than relying on RLS alone (see CLAUDE.md task
// scope, section 3: RLS is a second layer, not the only one).
export async function fetchPatientById(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<Patient | null> {
  const { data, error } = await supabase
    .from("patients")
    .select(PATIENT_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}
