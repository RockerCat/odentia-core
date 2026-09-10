import type { SupabaseClient } from "@supabase/supabase-js";

// Real Atenciones data — public.patient_clinical_encounters (see the
// migration): one row per clinical encounter. Same convention as
// medical-history-data.ts/tooth-findings-data.ts (already-constructed
// SupabaseClient, runs unchanged server- or client-side).
//
// finalizedAt (nullable) is the draft/finalized state itself (see the
// 20260903120000 migration's own comment) — null means "Guardar borrador"
// created/updated this row but "Finalizar atención" hasn't happened yet.
// fetchPatientClinicalEncounters (Historia Clínica's own read) filters to
// finalizedAt IS NOT NULL — a draft is never a real clinical record yet.

export type ClinicalEncounterRecord = {
  id: string;
  patientId: string;
  appointmentId: string | null;
  occurredAt: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  indications: string | null;
  // RIPS #4 — U09 incapacidad, LstSiNo (01/02). Lives on the encounter,
  // never on patients (see the migration adding this column: it's a fact
  // of THIS atención, not a stable patient attribute).
  incapacityCode: string | null;
  attendedBy: string | null;
  finalizedAt: string | null;
  createdAt: string;
};

type ClinicalEncounterRow = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  occurred_at: string;
  reason: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  indications: string | null;
  incapacity_code: string | null;
  attended_by: string | null;
  finalized_at: string | null;
  created_at: string;
};

export function mapClinicalEncounterRow(row: ClinicalEncounterRow): ClinicalEncounterRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    occurredAt: row.occurred_at,
    reason: row.reason,
    diagnosis: row.diagnosis,
    treatment: row.treatment,
    notes: row.notes,
    indications: row.indications,
    incapacityCode: row.incapacity_code,
    attendedBy: row.attended_by,
    finalizedAt: row.finalized_at,
    createdAt: row.created_at,
  };
}

// clinic_id filter is redundant with RLS (patient_clinical_encounters_select_member
// already scopes to the caller's own clinic membership) — kept as an
// explicit second check anyway, same convention as
// fetchPatientMedicalHistory/fetchPatientToothFindings. Chronological order
// (occurred_at desc — most recent encounter first), matching the demo's
// timeline (see clinical-record-screen.tsx's AtencionesTab).
const CLINICAL_ENCOUNTER_COLUMNS =
  "id, patient_id, appointment_id, occurred_at, reason, diagnosis, treatment, notes, indications, incapacity_code, attended_by, finalized_at, created_at";

// Historia Clínica / PDF export — only ever shows FINALIZED encounters. A
// draft ("Guardar borrador" without "Finalizar atención" yet) is not a real
// clinical record, and must never appear here even though the row already
// exists in Postgres.
export async function fetchPatientClinicalEncounters(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<ClinicalEncounterRecord[]> {
  const { data, error } = await supabase
    .from("patient_clinical_encounters")
    .select(CLINICAL_ENCOUNTER_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .not("finalized_at", "is", null)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapClinicalEncounterRow);
}

// Used by /agenda/atencion/[appointmentId] on every load to check whether
// this Cita already has a draft or finalized encounter — see the
// appointment_id migration's own comment
// (patient_clinical_encounters_appointment_id_key): at most one row per
// appointment_id. Lets a refresh (or "Continuar atención") reconstruct
// exactly the persisted draft, and lets a retried "Finalizar atención"
// tell "already finalized, just complete the Cita" apart from "still a
// draft" without relying on client-only state. Deliberately NOT filtered
// by finalized_at — this is the resume check, drafts included.
export async function fetchClinicalEncounterByAppointmentId(
  supabase: SupabaseClient,
  clinicId: string,
  appointmentId: string,
): Promise<ClinicalEncounterRecord | null> {
  const { data, error } = await supabase
    .from("patient_clinical_encounters")
    .select(CLINICAL_ENCOUNTER_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapClinicalEncounterRow(data) : null;
}

export type ClinicalEncounterProcedureRecord = {
  id: string;
  encounterId: string;
  name: string;
  note: string | null;
  position: number;
};

function mapClinicalEncounterProcedureRow(row: {
  id: string;
  encounter_id: string;
  name: string;
  note: string | null;
  position: number;
}): ClinicalEncounterProcedureRecord {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    name: row.name,
    note: row.note,
    position: row.position,
  };
}

// One sequential query, not a nested PostgREST select through the
// composite (encounter_id, clinic_id) FK — same convention/reasoning as
// appointments-data.ts's own top comment (no plain single-column FK
// PostgREST could embed through cleanly here either).
export async function fetchClinicalEncounterProcedures(
  supabase: SupabaseClient,
  clinicId: string,
  encounterId: string,
): Promise<ClinicalEncounterProcedureRecord[]> {
  const { data, error } = await supabase
    .from("patient_clinical_encounter_procedures")
    .select("id, encounter_id, name, note, position")
    .eq("clinic_id", clinicId)
    .eq("encounter_id", encounterId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapClinicalEncounterProcedureRow);
}

// RIPS #4 — structured diagnoses (public.encounter_diagnoses). Never the
// source of the ~15-screen-wide legacy `.diagnosis` free-text field above
// (which the real screen has always saved as null — see
// real-clinical-encounter-screen.tsx) — this is the real, catalog-checked
// CIE-10 data.
export type EncounterDiagnosisRecord = {
  id: string;
  encounterId: string;
  cie10Code: string;
  role: "principal" | "related";
  diagnosisTypeCode: string | null;
  encounterServiceId: string | null;
  sequence: number;
};

function mapEncounterDiagnosisRow(row: {
  id: string;
  encounter_id: string;
  cie10_code: string;
  role: "principal" | "related";
  diagnosis_type_code: string | null;
  encounter_service_id: string | null;
  sequence: number;
}): EncounterDiagnosisRecord {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    cie10Code: row.cie10_code,
    role: row.role,
    diagnosisTypeCode: row.diagnosis_type_code,
    encounterServiceId: row.encounter_service_id,
    sequence: row.sequence,
  };
}

export async function fetchEncounterDiagnoses(
  supabase: SupabaseClient,
  clinicId: string,
  encounterId: string,
): Promise<EncounterDiagnosisRecord[]> {
  const { data, error } = await supabase
    .from("encounter_diagnoses")
    .select("id, encounter_id, cie10_code, role, diagnosis_type_code, encounter_service_id, sequence")
    .eq("clinic_id", clinicId)
    .eq("encounter_id", encounterId)
    .order("sequence", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapEncounterDiagnosisRow);
}

// RIPS #4 — services actually performed (public.encounter_services).
// NEVER derived from a Treatment Plan or from
// patient_clinical_encounter_procedures (the free-text, non-CUPS list
// above) — see this task's own core principle.
export type EncounterServiceRecord = {
  id: string;
  encounterId: string;
  professionalProfileId: string;
  cupsCode: string;
  ripsServiceType: "consultation" | "procedure" | "unknown";
  performedAt: string;
  serviceValue: number | null;
  viaIngresoCode: string | null;
  modalidadCode: string | null;
  grupoServiciosCode: string | null;
  codServicioCode: string | null;
  finalidadCode: string | null;
  causaMotivoCode: string | null;
  conceptoRecaudoCode: string | null;
  valorPagoModerador: number | null;
  sequence: number;
};

function mapEncounterServiceRow(row: {
  id: string;
  encounter_id: string;
  professional_profile_id: string;
  cups_code: string;
  rips_service_type: "consultation" | "procedure" | "unknown";
  performed_at: string;
  service_value: number | null;
  via_ingreso_code: string | null;
  modalidad_code: string | null;
  grupo_servicios_code: string | null;
  cod_servicio_code: string | null;
  finalidad_code: string | null;
  causa_motivo_code: string | null;
  concepto_recaudo_code: string | null;
  valor_pago_moderador: number | null;
  sequence: number;
}): EncounterServiceRecord {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    professionalProfileId: row.professional_profile_id,
    cupsCode: row.cups_code,
    ripsServiceType: row.rips_service_type,
    performedAt: row.performed_at,
    serviceValue: row.service_value,
    viaIngresoCode: row.via_ingreso_code,
    modalidadCode: row.modalidad_code,
    grupoServiciosCode: row.grupo_servicios_code,
    codServicioCode: row.cod_servicio_code,
    finalidadCode: row.finalidad_code,
    causaMotivoCode: row.causa_motivo_code,
    conceptoRecaudoCode: row.concepto_recaudo_code,
    valorPagoModerador: row.valor_pago_moderador,
    sequence: row.sequence,
  };
}

const ENCOUNTER_SERVICE_COLUMNS =
  "id, encounter_id, professional_profile_id, cups_code, rips_service_type, performed_at, service_value, via_ingreso_code, modalidad_code, grupo_servicios_code, cod_servicio_code, finalidad_code, causa_motivo_code, concepto_recaudo_code, valor_pago_moderador, sequence";

export async function fetchEncounterServices(
  supabase: SupabaseClient,
  clinicId: string,
  encounterId: string,
): Promise<EncounterServiceRecord[]> {
  const { data, error } = await supabase
    .from("encounter_services")
    .select(ENCOUNTER_SERVICE_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("encounter_id", encounterId)
    .order("sequence", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapEncounterServiceRow);
}

export type EncounterClinicalData = {
  diagnoses: EncounterDiagnosisRecord[];
  services: EncounterServiceRecord[];
};

// Historia Clínica's Atenciones timeline (AtencionesTab) shows every
// finalized encounter's diagnósticos/servicios read-only — one batched
// query per list (never one query per encounter/row) keyed by
// encounter_id, same tenant-safety double-check (clinic_id) as every
// other fetch in this file.
export async function fetchEncounterClinicalDataForEncounters(
  supabase: SupabaseClient,
  clinicId: string,
  encounterIds: string[],
): Promise<Map<string, EncounterClinicalData>> {
  const result = new Map<string, EncounterClinicalData>();
  if (encounterIds.length === 0) return result;

  const [diagnosesResponse, servicesResponse] = await Promise.all([
    supabase
      .from("encounter_diagnoses")
      .select("id, encounter_id, cie10_code, role, diagnosis_type_code, encounter_service_id, sequence")
      .eq("clinic_id", clinicId)
      .in("encounter_id", encounterIds)
      .order("sequence", { ascending: true }),
    supabase
      .from("encounter_services")
      .select(ENCOUNTER_SERVICE_COLUMNS)
      .eq("clinic_id", clinicId)
      .in("encounter_id", encounterIds)
      .order("sequence", { ascending: true }),
  ]);
  if (diagnosesResponse.error) throw diagnosesResponse.error;
  if (servicesResponse.error) throw servicesResponse.error;

  for (const id of encounterIds) result.set(id, { diagnoses: [], services: [] });
  for (const row of diagnosesResponse.data ?? []) {
    result.get(row.encounter_id)?.diagnoses.push(mapEncounterDiagnosisRow(row));
  }
  for (const row of servicesResponse.data ?? []) {
    result.get(row.encounter_id)?.services.push(mapEncounterServiceRow(row));
  }
  return result;
}
