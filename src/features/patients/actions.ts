import { createClient } from "@/lib/supabase/client";
import type { Patient } from "./data";

// Real writes on public.patients — under patients_insert_admin_or_assistant
// / patients_update_admin_or_assistant RLS (clinic_admin or assistant of
// that clinic only; dentist is SELECT-only by design, matching the
// existing product rule already encoded in that policy). No DELETE here —
// there's no DELETE policy either (the table's own convention is
// active = false, never a real row delete).

export type CreatePatientInput = {
  clinicId: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
};

export type CreatePatientOutcome = { status: "ok"; patient: Patient } | { status: "error"; message: string };

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

export async function createPatient(input: CreatePatientInput): Promise<CreatePatientOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: input.clinicId,
      first_name: input.firstName,
      last_name: input.lastName,
      document_id: input.documentId,
      phone: input.phone,
      email: input.email,
      birth_date: input.birthDate,
    })
    .select("id, first_name, last_name, document_id, phone, email, birth_date, active, created_at")
    .single();

  if (error) {
    // patients_clinic_id_document_id_key — one document per clinic, not
    // global (see the foundation schema migration).
    if (error.code === "23505") {
      return { status: "error", message: "Ya existe un paciente con este documento en tu clínica." };
    }
    return { status: "error", message: "No pudimos crear el paciente. Intenta de nuevo." };
  }

  return { status: "ok", patient: mapRow(data) };
}

export type PatientPatch = Partial<{
  firstName: string;
  lastName: string;
  documentId: string | null;
  phone: string | null;
  email: string | null;
}>;

export type ActionOutcome = { status: "ok" } | { status: "error"; message: string };

export async function updatePatient(patientId: string, patch: PatientPatch): Promise<ActionOutcome> {
  const supabase = createClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.firstName !== undefined) dbPatch.first_name = patch.firstName;
  if (patch.lastName !== undefined) dbPatch.last_name = patch.lastName;
  if (patch.documentId !== undefined) dbPatch.document_id = patch.documentId;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone;
  if (patch.email !== undefined) dbPatch.email = patch.email;

  const { error } = await supabase.from("patients").update(dbPatch).eq("id", patientId);
  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "Ya existe un paciente con este documento en tu clínica." };
    }
    return { status: "error", message: "No pudimos guardar el cambio. Intenta de nuevo." };
  }
  return { status: "ok" };
}
