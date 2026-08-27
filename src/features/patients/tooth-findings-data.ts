import type { SupabaseClient } from "@supabase/supabase-js";
import type { FindingType, OdontogramData, ToothFinding, ToothSurface } from "@/features/dashboard/odontogram-teeth";

// Real Odontograma data — public.patient_tooth_findings (see the migration):
// one row PER FINDING, not a per-patient JSON blob. Same convention as
// medical-history-data.ts (already-constructed SupabaseClient, runs
// unchanged server- or client-side).

export type ToothFindingRecord = {
  id: string;
  patientId: string;
  toothFdi: number;
  findingType: FindingType;
  surfaces: ToothSurface[];
  note: string | null;
  recordedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapToothFindingRow(row: {
  id: string;
  patient_id: string;
  tooth_fdi: number;
  finding_type: string;
  surfaces: string[];
  note: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}): ToothFindingRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    toothFdi: row.tooth_fdi,
    findingType: row.finding_type as FindingType,
    surfaces: row.surfaces as ToothSurface[],
    note: row.note,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// clinic_id filter is redundant with RLS (patient_tooth_findings_select_member
// already scopes to the caller's own clinic membership) — kept as an
// explicit second check anyway, same convention as fetchPatientMedicalHistory.
export async function fetchPatientToothFindings(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<ToothFindingRecord[]> {
  const { data, error } = await supabase
    .from("patient_tooth_findings")
    .select("id, patient_id, tooth_fdi, finding_type, surfaces, note, recorded_by, created_at, updated_at")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapToothFindingRow);
}

// Reshapes the flat finding rows into the same Record<fdi, ToothFinding[]>
// shape OdontogramPreview already expects (see odontogram-teeth.tsx) — the
// shared visual component is reused completely unchanged, only what feeds
// it is real now. Insertion order (created_at asc, from the query above)
// is preserved, so "latest finding per tooth" (the preview's own coloring
// rule) means the same thing here as it does for the demo's local state.
export function toOdontogramData(findings: ToothFindingRecord[]): OdontogramData {
  const data: OdontogramData = {};
  for (const finding of findings) {
    const entry: ToothFinding = {
      id: finding.id,
      type: finding.findingType,
      surfaces: finding.surfaces,
      note: finding.note ?? "",
    };
    data[finding.toothFdi] = [...(data[finding.toothFdi] ?? []), entry];
  }
  return data;
}
